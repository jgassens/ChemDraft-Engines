import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const work = path.resolve(process.argv[2]);
const inputs = JSON.parse(readFileSync(new URL('./inputs.json', import.meta.url), 'utf8'));
assert.equal(process.env.RDKIT_SOURCE_TAG, 'Release_2026_03_5');
inputs.sources.push({
  name: 'rdkit',
  version: '2026.03.5',
  url: `https://github.com/rdkit/rdkit/archive/refs/tags/${process.env.RDKIT_SOURCE_TAG}.tar.gz`,
  sha256: process.env.RDKIT_SOURCE_SHA256,
});

// Refuse incomplete pins before any build-input network access. Never learn a pin from a download.
const missing = [...inputs.sources, ...inputs.wheels]
  .filter(({ sha256 }) => !/^[a-f0-9]{64}$/.test(sha256 ?? ''));
assert.equal(missing.length, 0, `Missing reviewed SHA-256: ${missing.map(({ name }) => name).join(', ')}`);

const lock = readFileSync('apps/desktop/src-tauri/resources/naming/requirements.txt', 'utf8');
for (const name of ['numpy', 'pillow']) {
  const pin = inputs.wheels.find((item) => item.name === name);
  const block = lock.split(/\n(?=[a-zA-Z])/).find((line) => line.startsWith(`${name}==`));
  assert.ok(block?.startsWith(`${name}==${pin.version} \\`), `${name} version differs from naming lock`);
  assert.ok(block.includes(`--hash=sha256:${pin.sha256}`), `${name} hash missing from naming lock`);
}

const downloads = path.join(work, 'downloads');
mkdirSync(downloads, { recursive: true });
function download(url, destination, expected) {
  assert.equal(new URL(url).protocol, 'https:');
  execFileSync('curl', ['--fail', '--location', '--retry', '3', '--proto', '=https',
    '--proto-redir', '=https', '--output', destination, url], { stdio: 'inherit' });
  const actual = createHash('sha256').update(readFileSync(destination)).digest('hex');
  assert.equal(actual, expected, `Checksum mismatch: ${path.basename(destination)}`);
}

for (const source of inputs.sources) {
  const archive = path.join(downloads, path.basename(new URL(source.url).pathname));
  download(source.url, archive, source.sha256);
  const destination = path.join(work, 'src', source.name);
  mkdirSync(destination, { recursive: true });
  execFileSync('tar', ['-xf', archive, '--strip-components=1', '-C', destination], { stdio: 'inherit' });
}
for (const pin of inputs.wheels) {
  // PyPI JSON only locates the exact filename. Its hash must equal the committed pin, and the
  // downloaded wheel is independently hashed before pip sees it; metadata is never a source of trust.
  const response = await fetch(`https://pypi.org/pypi/${pin.name}/${pin.version}/json`);
  assert.ok(response.ok, `PyPI lookup failed: ${pin.name} (${response.status})`);
  const metadata = await response.json();
  const file = metadata.urls.find(({ filename }) => filename === pin.filename);
  assert.ok(file, `Missing pinned wheel: ${pin.filename}`);
  assert.equal(new URL(file.url).hostname, 'files.pythonhosted.org');
  assert.equal(file.digests.sha256, pin.sha256, `PyPI digest changed: ${pin.filename}`);
  download(file.url, path.join(downloads, pin.filename), pin.sha256);
}
writeFileSync(path.join(work, 'inputs.json'), `${JSON.stringify(inputs, null, 2)}\n`);
writeFileSync(path.join(work, 'offline.sb'), '(version 1)\n(allow default)\n(deny network*)\n');
writeFileSync(path.join(work, 'tools.txt'), inputs.wheels
  .map(({ name, version, sha256 }) => `${name}==${version} --hash=sha256:${sha256}\n`).join(''));
