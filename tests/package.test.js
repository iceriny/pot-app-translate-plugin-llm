import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { buildPlugin } from '../scripts/build.mjs';

async function fixture(t, source = 'import { value } from "./lib/value.js"; export const translate = () => value;') {
  const root = await mkdtemp(join(tmpdir(), 'manggo-build-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'lib'));
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await writeFile(join(root, 'main.js'), source);
  await writeFile(join(root, 'lib/value.js'), 'export const value = "bundled";');
  return root;
}

test('production build is a deterministic importable single-file bundle', async (t) => {
  const root = await fixture(t);
  const info = await buildPlugin(root);
  const first = await readFile(join(root, 'build/main.js'));
  await buildPlugin(root);
  assert.deepEqual(await readFile(join(root, 'build/main.js')), first);
  assert.deepEqual(info.imports, []);
  assert.equal(info.minified, true);
  assert.equal(info.sourcemap, false);
  assert.deepEqual(Object.keys(info.inputs), ['lib/value.js', 'main.js']);
  assert.ok(first.length < 160);
  await rm(join(root, 'lib'), { recursive: true });
  const built = await import(pathToFileURL(join(root, 'build/main.js')));
  assert.equal(built.translate(), 'bundled');
});

test('build rejects external dependencies', async (t) => {
  const root = await fixture(t, 'import fs from "node:fs"; export const translate = () => fs.readFileSync("x");');
  await assert.rejects(buildPlugin(root), /Could not resolve/);
});

test('build rejects computed dynamic imports', async (t) => {
  const root = await fixture(t, 'export const translate = name => import(name);');
  await assert.rejects(buildPlugin(root), /unresolved module loader/);
});

test('build rejects JavaScript outside the approved source directories', async (t) => {
  const root = await fixture(t, 'import { secret } from "./unexpected.js"; export const translate = () => secret;');
  await writeFile(join(root, 'unexpected.js'), 'export const secret = "not-approved";');
  await assert.rejects(buildPlugin(root), /Unexpected bundle source/);
});
