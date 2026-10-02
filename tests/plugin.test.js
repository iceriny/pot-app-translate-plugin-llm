import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate as sourceTranslate, dictionary as sourceDictionary } from '../main.js';
import { translate as bundledTranslate, dictionary as bundledDictionary } from '../build/main.js';
import { resolveConfig, normalizeEndpoint } from '../lib/config.js';
import { parseInput, buildMessages, formatDictionary, languageName, notation } from '../lib/prompts.js';

const config = { apiKey: 'test-key-do-not-use', stream: false, lang: 'en' };
function jsonResponse(content, extra = {}) {
  return new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop', ...extra }] }), { headers: { 'content-type': 'application/json' } });
}
function event(content, extra = {}) { return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, ...extra }] })}\n\n`; }
function streamResponse(text, chunkSize = 7, lineEnding = '\n') {
  const bytes = new TextEncoder().encode(text.replaceAll('\n', lineEnding));
  let pos = 0;
  let cancelled = false;
  const response = new Response(new ReadableStream({
    pull(controller) { if (pos === bytes.length) controller.close(); else { controller.enqueue(bytes.slice(pos, pos + chunkSize)); pos += Math.min(chunkSize, bytes.length - pos); } },
    cancel() { cancelled = true; },
  }), { headers: { 'content-type': 'text/event-stream; charset=utf-8' } });
  return { response, wasCancelled: () => cancelled };
}
function options(response, overrides = {}) {
  let request;
  const deltas = [];
  const opts = { config, setResult: delta => deltas.push(delta), utils: { fetch: async (url, init) => { request = { url, ...init, data: JSON.parse(init.body) }; return typeof response === 'function' ? response() : response; } }, ...overrides };
  return { opts, deltas, request: () => request };
}

for (const [flavor, translate, dictionary] of [['source', sourceTranslate, sourceDictionary], ['minified', bundledTranslate, bundledDictionary]]) {
  test(`${flavor}: offline help never needs configuration or network`, async () => {
    assert.match(await translate('?', 'auto', '', {}), /Manggo/);
    assert.match(await translate('$help', '', '', { config: { lang: 'en' } }), /offline help/);
  });
  test(`${flavor}: native fetch request, provider defaults and no vendor-only fields`, async () => {
    const fixture = options(jsonResponse(' 你好\n'));
    assert.equal(await translate('Hello', 'en_US', 'zh_CN', fixture.opts), ' 你好\n');
    assert.equal(fixture.request().url, 'https://api.deepseek.com/chat/completions');
    assert.equal(fixture.request().data.model, 'deepseek-chat');
    assert.equal(fixture.request().data.stream, false);
    assert.equal(fixture.request().data.enable_thinking, undefined);
    assert.equal(fixture.request().data.response_format, undefined);
    assert.equal(fixture.request().data.temperature, undefined);
    assert.ok(fixture.request().signal instanceof AbortSignal);
    assert.equal(fixture.request().headers.Authorization, 'Bearer test-key-do-not-use');
    assert.deepEqual(fixture.deltas, []);
  });
  test(`${flavor}: auto-detect, target variant, glossary and preferences reach prompt`, async () => {
    const fixture = options(jsonResponse('OK'), { config: { ...config, glossary: 'Apple = 苹果', instructions: 'Use business style' }, detect: 'ja_JP' });
    await translate('text', 'auto', 'zh_TW', fixture.opts);
    const system = fixture.request().data.messages[0].content;
    assert.match(system, /Japanese.*Traditional Chinese/);
    assert.match(system, /Apple = 苹果/); assert.match(system, /Use business style/);
  });
  for (const newline of ['\n', '\r\n', '\r']) {
    test(`${flavor}: split UTF-8 SSE ${JSON.stringify(newline)} emits deltas once`, async () => {
      const { response } = streamResponse(': keepalive\n\n' + event('你') + event('好 🌍') + event('', { finish_reason: 'stop' }) + 'data: [DONE]\n\n', 1, newline);
      const fixture = options(response, { config: { ...config, stream: true } });
      assert.equal(await translate('Hello', 'en_US', 'zh_CN', fixture.opts), '你好 🌍');
      assert.deepEqual(fixture.deltas, ['你', '好 🌍']);
      assert.equal(fixture.request().data.stream, true);
    });
  }
  test(`${flavor}: SSE usage event, no trailing separator and DONE end immediately`, async () => {
    const { response } = streamResponse(event('ok') + 'data: {"choices":[],"usage":{"total_tokens":9}}\n\n' + 'data: [DONE]', 2);
    const fixture = options(response, { config: { ...config, stream: true } });
    assert.equal(await translate('Hi', 'en_US', 'en_US', fixture.opts), 'ok');
    const later = options(streamResponse(event('ok') + 'data: [DONE]\n\n' + 'data: not json\n\n').response, { config: { ...config, stream: true } });
    assert.equal(await translate('Hi', 'en_US', 'en_US', later.opts), 'ok');
  });
  test(`${flavor}: SSE multiline data and clean finish without DONE`, async () => {
    const { response } = streamResponse('event: message\ndata: {"choices": [\ndata: {"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n');
    assert.equal(await translate('Hi', 'en_US', 'en_US', options(response).opts), 'ok');
  });
  test(`${flavor}: rejects dropped, malformed, empty and provider-error streams`, async () => {
    for (const [payload, pattern] of [[event('partial'), /incomplete/], ['data: invalid\n\n', /Malformed/], ['data: [DONE]\n\n', /no text/], ['data: {"error":{"message":"bad key"}}\n\n', /Provider error/]]) {
      await assert.rejects(translate('Hi', 'en_US', 'en_US', options(streamResponse(payload).response).opts), pattern);
    }
  });
  test(`${flavor}: truncated and filtered responses fail, including stream`, async () => {
    for (const [reason, pattern] of [['length', /truncated/], ['content_filter', /filtered/]]) {
      await assert.rejects(translate('Hi', 'en_US', 'en_US', options(jsonResponse('partial', { finish_reason: reason })).opts), pattern);
      await assert.rejects(translate('Hi', 'en_US', 'en_US', options(streamResponse(event('partial') + event('', { finish_reason: reason })).response).opts), pattern);
    }
  });
  test(`${flavor}: JSON response fallback when server ignores streaming`, async () => {
    const fixture = options(jsonResponse('hello'), { config: { ...config, stream: true } });
    assert.equal(await translate('Hi', 'en_US', 'en_US', fixture.opts), 'hello');
    assert.deepEqual(fixture.deltas, []);
  });
  test(`${flavor}: structured commands buffer, validate JSON and format`, async () => {
    for (const [command, response, expected] of [
      ['$p', { literal: 'literal', free: 'polished' }, 'Polished version'],
      ['$cf', { literal: 'literal', free: 'friendly' }, 'Feminine colloquial version'],
      ['$cm', { literal: 'literal', free: 'short' }, 'Masculine colloquial version'],
      ['$r', { phonetic: 'həˈləʊ' }, 'Source pronunciation'],
      ['$r>', { translation: '你好', phonetic: 'nǐ hǎo' }, 'Target pronunciation'],
      ['$r<', { translation: '你好', phonetic: 'həˈləʊ' }, 'Source pronunciation'],
      ['$r<>', { translation: '你好', sourcePhonetic: 'həˈləʊ', targetPhonetic: 'nǐ hǎo' }, 'Target pronunciation'],
    ]) {
      const fixture = options(jsonResponse('```json\n' + JSON.stringify(response) + '\n```'), { config: { ...config, stream: true, jsonMode: true } });
      assert.match(await translate(command + ' Hello', 'en_US', 'zh_CN', fixture.opts), new RegExp(expected));
      assert.equal(fixture.request().data.stream, false);
      assert.deepEqual(fixture.request().data.response_format, { type: 'json_object' });
      assert.deepEqual(fixture.deltas, []);
    }
  });
  test(`${flavor}: malformed or missing structured field fails clearly`, async () => {
    await assert.rejects(translate('$p Hello', 'en_US', 'zh_CN', options(jsonResponse('not json')).opts), /valid JSON/);
    await assert.rejects(translate('$p Hello', 'en_US', 'zh_CN', options(jsonResponse('{"literal":"hi"}')).opts), /free/);
  });
  test(`${flavor}: question/source pronunciation do not need target language`, async () => {
    const fixture = options(jsonResponse('answer'));
    assert.equal(await translate('$q What is 2+2?', 'auto', '', fixture.opts), 'answer');
    assert.match(fixture.request().data.messages[0].content, /Do not translate unless asked/);
    assert.equal(fixture.request().data.messages[1].content, 'What is 2+2?');
    assert.match(await translate('$r hello', 'en_US', '', options(jsonResponse('{"phonetic":"həˈləʊ"}')).opts), /həˈləʊ/);
    await assert.rejects(translate('hi', 'en_US', 'auto', options(jsonResponse('no')).opts), /target language/);
  });
  test(`${flavor}: errors throw, redact HTTP body and never return as a translation`, async () => {
    for (const status of [401, 403, 404, 429, 500]) {
      let calls = 0;
      const fixture = options(() => { calls++; return new Response('private input test-key-do-not-use', { status }); });
      await assert.rejects(translate('Hi', 'en_US', 'zh_CN', fixture.opts), error => {
        assert.match(error.message, new RegExp(`HTTP ${status}`));
        assert.doesNotMatch(error.message, /private input|test-key-do-not-use/); return true;
      });
      assert.equal(calls, 1);
    }
    await assert.rejects(translate('Hi', 'en_US', 'zh_CN', options(new Response('<html>oops</html>')).opts), /invalid JSON/);
    await assert.rejects(translate('Hi', 'en_US', 'zh_CN', options(jsonResponse('')).opts), /no text/);
  });
  test(`${flavor}: embedded API errors redact keys`, async () => {
    const fixture = options(new Response(JSON.stringify({ error: { message: 'Invalid test-key-do-not-use Bearer secret-token sk-ABC123456' } })));
    await assert.rejects(translate('Hi', 'en_US', 'zh_CN', fixture.opts), error => {
      assert.match(error.message, /redacted/); assert.doesNotMatch(error.message, /test-key|secret-token|sk-ABC/); return true;
    });
  });
  test(`${flavor}: dictionary uses strict native shape and drops unexpected fields/URLs`, async () => {
    const entry = { word: 'wrong', language: 'wrong', audioUrl: 'https://untrusted.invalid', pronunciations: [{ label: 'IPA', phonetic: 'həˈləʊ', audioUrl: 'https://untrusted.invalid' }], meanings: [{ partOfSpeech: 'interjection', translations: ['你好'], definitions: ['greeting'], examples: ['Hello! 你好！'], extra: 'no' }, null], forms: [{ type: 'plural', word: 'hellos' }] };
    const fixture = options(jsonResponse(JSON.stringify(entry)), { config: { ...config, stream: true }, detect: 'en_US' });
    const result = await dictionary('hello', 'auto', 'zh_CN', fixture.opts);
    assert.deepEqual(Object.keys(result), ['kind', 'dictionary']);
    assert.equal(result.kind, 'dictionary'); assert.equal(result.dictionary.word, 'hello');
    assert.equal(result.dictionary.language, 'en_US');
    assert.equal(result.dictionary.meanings.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /untrusted|wrong|extra/);
    assert.equal(fixture.request().data.stream, false); assert.deepEqual(fixture.deltas, []);
  });
  test(`${flavor}: dictionary rejects long input and missing meanings`, async () => {
    await assert.rejects(dictionary('a'.repeat(201), 'en_US', 'zh_CN', { config }), /long text/);
    await assert.rejects(dictionary('hello', 'en_US', 'zh_CN', options(jsonResponse('{}')).opts), /no meanings/);
  });
  test(`${flavor}: local Ollama requires model but no key`, async () => {
    const fixture = options(jsonResponse('yes'), { config: { provider: 'ollama', model: 'local-model', stream: false } });
    assert.equal(await translate('Hi', 'en_US', 'zh_CN', fixture.opts), 'yes');
    assert.equal(fixture.request().url, 'http://localhost:11434/v1/chat/completions');
    assert.equal(fixture.request().headers.Authorization, undefined);
  });
  test(`${flavor}: no cross-request cache mixes providers or configuration`, async () => {
    let calls = 0;
    const fixture = options(() => jsonResponse(String(++calls)));
    assert.equal(await translate('same', 'en_US', 'zh_CN', fixture.opts), '1');
    fixture.opts.config = { ...config, model: 'different-model' };
    assert.equal(await translate('same', 'en_US', 'zh_CN', fixture.opts), '2');
    assert.equal(fixture.request().data.model, 'different-model');
  });
  test(`${flavor}: timeout aborts native fetch without retry`, async () => {
    let calls = 0;
    const nativeSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = (callback, delay, ...args) => nativeSetTimeout(callback, Math.min(delay, 10), ...args);
    try {
      await assert.rejects(translate('hello', 'en_US', 'zh_CN', { config: { ...config, timeoutSeconds: 5 }, utils: { fetch: (url, init) => { calls++; return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })); } } }), /timed out/);
      assert.equal(calls, 1);
    } finally { globalThis.setTimeout = nativeSetTimeout; }
  });
}

test('provider presets resolve independently and input types are validated', () => {
  assert.equal(resolveConfig({ apiKey: 'x', provider: 'siliconflow', model: ' ' }).model, 'deepseek-ai/DeepSeek-V3.1');
  assert.equal(resolveConfig({ apiKey: 'x', temperature: 0 }).temperature, 0);
  for (const raw of [{ maxTokens: 0 }, { maxTokens: 1.2 }, { timeoutSeconds: 301 }, { temperature: 3 }, { maxTokens: 'NaN' }]) assert.throws(() => resolveConfig({ apiKey: 'x', ...raw }));
  assert.throws(() => resolveConfig({ provider: 'bad' }), /未知/);
  assert.throws(() => resolveConfig({}), /API/);
});
test('URL normalization and credential transport restrictions', () => {
  assert.equal(normalizeEndpoint(' https://example.com/v1/ ').endpoint, 'https://example.com/v1/chat/completions');
  assert.equal(normalizeEndpoint('https://example.com/chat/completions').endpoint, 'https://example.com/chat/completions');
  for (const url of ['http://public.example/v1', 'file:///tmp/key', 'https://u:p@example.com/v1', 'https://example.com/v1?api_key=secret', 'https://example.com/#fragment']) assert.throws(() => normalizeEndpoint(url));
  assert.ok(normalizeEndpoint('http://[::1]:11434/v1').local);
});
test('command aliases, boundaries and empty content', () => {
  for (const command of ['$t', '>t']) assert.equal(parseInput(command + ' hi').mode, 'translate');
  assert.equal(parseInput('$r<>hello').mode, 'bothPhonetic');
  assert.equal(parseInput('$r>你好').content, '你好');
  assert.equal(parseInput('$price is 5').mode, 'translate');
  assert.equal(parseInput('$query text').mode, 'translate');
  for (const text of ['', '  ', '$p', '$r<>']) assert.throws(() => parseInput(text));
});
test('language names and pronunciation handle mapped variants', () => {
  assert.equal(languageName('zh-Hant'), 'Traditional Chinese');
  assert.equal(languageName('pt_BR'), 'Brazilian Portuguese');
  assert.equal(notation('zh_CN'), 'Pinyin with tone marks');
  assert.equal(notation('ja_JP'), 'Hepburn romanization');
});
