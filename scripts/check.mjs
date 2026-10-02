#!/usr/bin/env node
// Dependency-free syntax checks for every maintained JavaScript and Python file.
import { readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['main.js', 'pack.py'];

function collect(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '__pycache__') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile() && /\.(?:m?js|py)$/.test(entry.name)) files.push(relative(root, path));
  }
}
for (const directory of ['lib', 'scripts', 'tests']) collect(join(root, directory));

for (const file of files.sort()) {
  const python = file.endsWith('.py');
  const command = python ? 'python3' : process.execPath;
  const args = python
    ? ['-c', 'import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"), filename=sys.argv[1])', file]
    : ['--check', file];
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) console.error(result.error.message);
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${files.length} files`);
