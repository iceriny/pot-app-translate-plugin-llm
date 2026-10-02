#!/usr/bin/env node
// Produce the sole JavaScript file shipped in the .mplugin archive.
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

export async function buildPlugin(root = repository) {
  root = resolve(root);
  const result = await build({
    absWorkingDir: root,
    entryPoints: ['main.js'],
    outfile: 'build/main.js',
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    minify: true,
    sourcemap: false,
    legalComments: 'none',
    charset: 'utf8',
    treeShaking: true,
    metafile: true,
    write: false,
    logLevel: 'silent',
  });
  if (result.warnings.length) {
    throw new Error(`Build warnings must be resolved: ${result.warnings.map((warning) => warning.text).join('; ')}`);
  }
  const outputs = Object.entries(result.metafile.outputs);
  if (outputs.length !== 1 || outputs[0][0] !== 'build/main.js' || result.outputFiles.length !== 1) {
    throw new Error('The production build must contain exactly one JavaScript output');
  }
  const output = outputs[0][1];
  const bundle = result.outputFiles[0];
  if (output.imports.length !== 0) throw new Error('The production bundle must not have external imports');
  // esbuild does not list computed import()/require() expressions in its
  // metafile. Reject any remaining loader call conservatively as well.
  if (/\b(?:import|require)\s*\(|\b__require\b/.test(bundle.text)) {
    throw new Error('The production bundle must not have unresolved module loader calls');
  }
  if (/sourceMappingURL\s*=/.test(bundle.text)) throw new Error('Production sourcemaps are forbidden');
  const inputs = {};
  for (const name of Object.keys(result.metafile.inputs).sort()) {
    if (!(name === 'main.js' || /^lib\/(?!.*(?:^|\/)\.\.?\/)[^\\]+\.js$/.test(name))) {
      throw new Error(`Unexpected bundle source: ${name}`);
    }
    inputs[name] = sha256(await readFile(join(root, name)));
  }
  const metadata = {
    format: 'esm',
    minified: true,
    sourcemap: false,
    imports: [],
    exports: [...output.exports].sort(),
    sha256: sha256(bundle.contents),
    inputs,
  };
  await mkdir(join(root, 'build'), { recursive: true });
  await writeFile(join(root, 'build/main.js'), bundle.contents);
  // Internal integrity data is deliberately outside the archive allowlist.
  await writeFile(join(root, 'build/build-info.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  return metadata;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await buildPlugin();
    console.log('Built build/main.js (minified ESM, no external imports or sourcemaps)');
  } catch (error) {
    console.error(`Build failed: ${error.message}`);
    process.exitCode = 1;
  }
}
