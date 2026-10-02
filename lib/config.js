export const PROVIDERS = Object.freeze({
  deepseek: { label: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
  siliconflow: { label: 'SiliconFlow', endpoint: 'https://api.siliconflow.cn/v1/chat/completions', model: 'deepseek-ai/DeepSeek-V3.1' },
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4.1-mini' },
  ollama: { label: 'Ollama', endpoint: 'http://localhost:11434/v1/chat/completions', model: '' },
  custom: { label: 'OpenAI-compatible', endpoint: '', model: '' },
});

export function message(lang, zh, en) { return lang === 'en' ? en : zh; }

function numberOption(value, fallback, min, max, name, integer = false) {
  const n = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new Error(`${name}: ${min}–${max}${integer ? ' (integer / 整数)' : ''}`);
  }
  return n;
}

export function normalizeEndpoint(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('API URL 无效 / Invalid API URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new Error('API URL 必须使用 HTTPS（本机服务可用 HTTP）/ HTTPS required except localhost');
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error('API URL 不可包含账号、密码、查询参数或片段 / Remove credentials, query and fragment from API URL');
  }
  let path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith('/chat/completions')) path += '/chat/completions';
  url.pathname = path;
  return { endpoint: url.toString(), local };
}

export function resolveConfig(raw = {}) {
  const lang = raw.lang === 'en' ? 'en' : 'zh_cn';
  const provider = raw.provider || 'deepseek';
  const preset = PROVIDERS[provider];
  if (!preset) throw new Error(message(lang, '未知服务商，请检查配置', 'Unknown provider; check configuration'));
  const { endpoint, local } = normalizeEndpoint(String(raw.endpoint || preset.endpoint));
  const model = String(raw.model || '').trim() || preset.model;
  if (!model) throw new Error(message(lang, '请填写模型 ID', 'Please enter a model ID'));
  const apiKey = String(raw.apiKey || '').trim();
  if (!apiKey && !local) throw new Error(message(lang, '请在服务设置中填写 API 密钥', 'Enter an API key in service settings'));
  return {
    provider, endpoint, model, apiKey, lang,
    stream: raw.stream !== false,
    jsonMode: raw.jsonMode === true,
    maxTokens: numberOption(raw.maxTokens, 4000, 1, 131072, 'maxTokens', true),
    timeoutSeconds: numberOption(raw.timeoutSeconds, 60, 5, 300, 'timeoutSeconds', true),
    temperature: raw.temperature === '' || raw.temperature === undefined || raw.temperature === null
      ? undefined : numberOption(raw.temperature, 0.1, 0, 2, 'temperature'),
    instructions: String(raw.instructions || '').trim(),
    glossary: String(raw.glossary || '').trim(),
  };
}
