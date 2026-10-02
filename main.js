import { resolveConfig, message } from './lib/config.js';
import { parseInput, help, buildMessages, formatStructured, formatDictionary } from './lib/prompts.js';
import { requestCompletion } from './lib/client.js';

/** Manggo native translation entry. setResult takes deltas, never cumulative text. */
export async function translate(text, from, to, options = {}) {
  const { mode, content } = parseInput(text);
  if (mode === 'help') return help(options.config?.lang);
  const config = resolveConfig(options.config);
  const source = !from || from === 'auto' ? (options.detect || 'auto') : from;
  const prompt = buildMessages(mode, content, source, to, config);
  const emit = typeof options.setResult === 'function' ? delta => options.setResult(delta)
    : typeof options.utils?.setResult === 'function' ? delta => options.utils.setResult(delta) : undefined;
  const response = await requestCompletion(config, prompt, options.utils, emit);
  // Manggo accepts the complete return value after streaming; do not emit it again.
  return prompt.structured ? formatStructured(mode, response, config.lang) : response;
}

/** Separate native dictionary service: validated host schema, no raw JSON or audio URLs. */
export async function dictionary(text, from, to, options = {}) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('请输入单词或短语 / Enter a word or short phrase');
  const content = text.trim();
  const config = resolveConfig(options.config);
  if (content.length > 200 || content.split(/\s+/).length > 30) {
    throw new Error(message(config.lang, 'AI 词典适用于单词或短语，长文本请使用 AI 翻译', 'Use AI Translate for long text; AI Dictionary is for words or short phrases'));
  }
  const source = !from || from === 'auto' ? (options.detect || 'auto') : from;
  const prompt = buildMessages('dictionary', content, source, to, config);
  const response = await requestCompletion(config, prompt, options.utils);
  return formatDictionary(response, content, source, config.lang);
}
