import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { translate, dictionary } from '../main.js';
import { languageName } from '../lib/prompts.js';

const manifest = JSON.parse(await readFile(new URL('../manggo.plugin.json', import.meta.url), 'utf8'));
const nativeLanguages = ['auto', 'en_US', 'zh_CN', 'zh_TW', 'ja_JP', 'ko_KR', 'fr_FR', 'vi_VN', 'de_DE', 'it_IT', 'ru_RU', 'uk_UA'];

test('review: official native example languages remain declared by both services', () => {
  for (const service of manifest.services) {
    for (const code of nativeLanguages) assert.ok(Object.hasOwn(service.language, code), `${service.id} is missing official language ${code}`);
  }
  assert.equal(languageName('uk_UA'), 'Ukrainian');
});

test('review: dictionary returns Manggo language IDs, not provider-language aliases', async () => {
  const service = manifest.services.find(item => item.id === 'dictionary');
  for (const hostLanguage of ['km_KH', 'fa_IR']) {
    if (!Object.hasOwn(service.language, hostLanguage)) continue;
    const result = await dictionary('word', service.language[hostLanguage], 'en_US', {
      config: { apiKey: 'review-key', lang: 'en', stream: false },
      utils: { fetch: async () => new Response(JSON.stringify({ choices: [{ message: { content: '{"meanings":[{"translations":["meaning"]}]}' }, finish_reason: 'stop' }] }), { headers: { 'content-type': 'application/json' } }) },
    });
    assert.equal(result.dictionary.language, hostLanguage);
  }
});

test('review: arbitrary native transport Errors cannot disclose credentials or source', async () => {
  const apiKey = 'review-credential-unique-9281';
  const source = 'review private source phrase';
  await assert.rejects(translate(source, 'en_US', 'zh_CN', {
    config: { apiKey, lang: 'en', stream: false },
    utils: { fetch: async () => { throw new Error(`Bridge request failed with ${apiKey} and ${source}`); } },
  }), error => {
    assert.doesNotMatch(error.message, /review-credential|private source phrase|Bridge request failed/);
    return true;
  });
});
