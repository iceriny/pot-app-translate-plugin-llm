import { message } from './config.js';

class PluginError extends Error {}

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

function safeServerMessage(value, apiKey) {
  let text = typeof value === 'string' ? value : '';
  if (apiKey) text = text.split(apiKey).join('[redacted]');
  return text.replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]').replace(/\bsk-[\w-]+/g, '[redacted]').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, 300);
}

async function readLimited(response, max = MAX_RESPONSE_BYTES) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (text.length > max) throw new PluginError('响应过大 / Response too large');
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) throw new PluginError('响应过大 / Response too large');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    try { await reader.cancel(); } catch { /* Stream may already be closed. */ }
    reader.releaseLock();
  }
}

function statusError(status, lang) {
  if (status === 401 || status === 403) return message(lang, '密钥无效或模型无访问权限', 'Invalid API key or model access denied');
  if (status === 429) return message(lang, '请求过多或余额/配额不足，请检查服务商账户后重试', 'Rate limit or quota exceeded; check your provider account before retrying');
  if (status === 404) return message(lang, '接口或模型不存在，请检查 API URL 与模型 ID', 'Endpoint or model not found; check API URL and model ID');
  if (status >= 500) return message(lang, '服务商暂时不可用，请稍后重试', 'Provider temporarily unavailable; try again later');
  return message(lang, '服务商拒绝请求，请检查模型和参数', 'Provider rejected the request; check model and settings');
}

function apiError(data, config) {
  if (!data?.error) return null;
  const detail = safeServerMessage(typeof data.error === 'string' ? data.error : data.error.message, config.apiKey);
  return new PluginError(`${message(config.lang, '服务商错误', 'Provider error')}${detail ? `: ${detail}` : ''}`);
}

function textContent(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('');
  return '';
}

function validateFinish(reason, config) {
  if (reason === 'length' || reason === 'max_tokens') throw new PluginError(message(config.lang, '输出被截断，请增大“最大输出 tokens”后重试', 'Output was truncated; increase max output tokens and retry'));
  if (reason === 'content_filter') throw new PluginError(message(config.lang, '服务商过滤了本次输出', 'The provider filtered this output'));
}

/** Decode SSE lines across CRLF, LF, CR, UTF-8 and network chunk boundaries. */
export async function readSse(response, config, onDelta) {
  if (!response.body?.getReader) throw new PluginError(message(config.lang, '当前运行时不支持流式读取，请关闭流式输出', 'Streaming reader unavailable; disable streaming'));
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let line = '';
  let pendingCR = false;
  let dataLines = [];
  let output = '';
  let bytes = 0;
  let doneMarker = false;
  let finishReason;
  let finished = false;
  const event = () => {
    if (!dataLines.length) return;
    const payload = dataLines.join('\n');
    dataLines = [];
    if (!payload.trim()) return;
    if (payload.trim() === '[DONE]') { doneMarker = true; return; }
    let data;
    try { data = JSON.parse(payload); } catch { throw new PluginError(message(config.lang, '流式数据格式无效，请重试或关闭流式输出', 'Malformed stream data; retry or disable streaming')); }
    const failure = apiError(data, config); if (failure) throw failure;
    const choice = data.choices?.find(item => item.index === 0) ?? data.choices?.[0];
    if (!choice) return; // Usage-only events and keepalives are valid.
    const delta = textContent(choice.delta?.content);
    if (delta) { output += delta; if (onDelta) onDelta(delta); }
    if (choice.delta?.refusal) throw new PluginError(message(config.lang, '模型拒绝回答此请求', 'The model refused this request'));
    if (choice.finish_reason) {
      finishReason = choice.finish_reason;
      validateFinish(finishReason, config);
      finished = true;
    }
  };
  const flushLine = () => {
    if (line === '') event();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
    line = '';
  };
  const consume = text => {
    for (const char of text) {
      if (doneMarker) break;
      if (pendingCR) { pendingCR = false; if (char === '\n') continue; }
      if (char === '\r') { flushLine(); pendingCR = true; }
      else if (char === '\n') flushLine();
      else line += char;
    }
  };
  try {
    while (!doneMarker) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new PluginError('响应过大 / Response too large');
      consume(decoder.decode(value, { stream: true }));
    }
    if (!doneMarker) { consume(decoder.decode()); if (line) flushLine(); event(); }
    // A dropped connection must never look like a successful partial translation.
    if (!doneMarker && !finished) throw new PluginError(message(config.lang, '连接提前结束，译文不完整，请重试', 'Connection ended early; translation is incomplete, please retry'));
    validateFinish(finishReason, config);
    if (!output.trim()) throw new PluginError(message(config.lang, '模型返回空内容，请检查模型是否支持文本输出', 'The model returned no text; check text-output support'));
    return output;
  } finally {
    try { await reader.cancel(); } catch { /* Already closed or aborted. */ }
    reader.releaseLock();
  }
}

export async function requestCompletion(config, prompt, utils, onDelta) {
  if (typeof utils?.fetch !== 'function') throw new PluginError('需要 Manggo 原生 utils.fetch / Manggo native utils.fetch is required');
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, config.timeoutSeconds * 1000);
  const stream = config.stream && !prompt.structured;
  const body = { model: config.model, messages: prompt.messages, stream, max_tokens: config.maxTokens };
  if (config.temperature !== undefined) body.temperature = config.temperature;
  if (config.jsonMode && prompt.structured) body.response_format = { type: 'json_object' };
  try {
    const response = await utils.fetch(config.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: stream ? 'text/event-stream, application/json' : 'application/json', ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) },
      body: JSON.stringify(body), signal: controller.signal,
    });
    if (!response.ok) {
      // Do not echo arbitrary error bodies: they can contain keys, source text or HTML.
      try { await response.body?.cancel(); } catch { /* Best effort only. */ }
      throw new PluginError(`HTTP ${response.status}: ${statusError(response.status, config.lang)}`);
    }
    const type = response.headers?.get('content-type') || '';
    if (type.toLowerCase().includes('text/event-stream')) return await readSse(response, config, prompt.structured ? undefined : onDelta);
    const raw = await readLimited(response);
    let data;
    try { data = JSON.parse(raw); } catch { throw new PluginError(message(config.lang, '接口未返回有效 JSON，请检查 API URL', 'Endpoint returned invalid JSON; check API URL')); }
    const failure = apiError(data, config); if (failure) throw failure;
    const choice = data.choices?.[0];
    validateFinish(choice?.finish_reason, config);
    if (choice?.message?.refusal) throw new PluginError(message(config.lang, '模型拒绝回答此请求', 'The model refused this request'));
    const content = textContent(choice?.message?.content);
    if (!content.trim()) throw new PluginError(message(config.lang, '模型返回空内容或不兼容响应', 'Model returned no text or an incompatible response'));
    return content;
  } catch (error) {
    if (timedOut) throw new PluginError(message(config.lang, `请求超时（${config.timeoutSeconds} 秒），请重试或增大超时`, `Request timed out (${config.timeoutSeconds}s); retry or increase timeout`));
    // Fetch transport errors may contain the endpoint; never expose config, stack or key.
    if (error instanceof PluginError) throw error;
    throw new PluginError(message(config.lang, '网络或宿主请求失败，请检查连接、代理和 API URL', 'Network or host request failed; check connection, proxy and API URL'));
  } finally { clearTimeout(timer); }
}
