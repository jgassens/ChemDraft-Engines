import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const work = process.env.WORK;
assert.ok(work, 'WORK must name the build directory');
const wheelhouse = path.join(work, 'wheelhouse');
const wheels = readdirSync(wheelhouse).filter((name) => name.endsWith('.whl'));
assert.deepEqual(wheels, ['rdkit-2026.3.5-cp312-cp312-macosx_11_0_x86_64.whl']);
const wheel = path.join(wheelhouse, wheels[0]);
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8' }).trim();
run('python3.12', ['-m', 'wheel', 'unpack', wheel, '--dest', path.join(work, 'audit')]);
const root = realpathSync(path.join(work, 'audit/rdkit-2026.3.5'));
const inside = (file) => file.startsWith(`${root}${path.sep}`);
const system = (file) => file.startsWith('/usr/lib/') || file.startsWith('/System/');

// Ask delocate to include system dependencies, then assert every resolved path explicitly.
const dependencies = run('delocate-listdeps', ['--all', root]);
console.log(dependencies);
for (const dependency of dependencies.split('\n').filter(Boolean)) {
  assert.ok(system(dependency) || inside(realpathSync(dependency)),
    `External dependency reported by delocate-listdeps: ${dependency}`);
}

function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else {
      assert.ok(!entry.isSymbolicLink(), `Unexpected wheel symlink: ${file}`);
      yield file;
    }
  }
}
const magics = new Set(['cffaedfe', 'cefaedfe', 'feedfacf', 'feedface', 'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca']);
let count = 0;
for (const file of files(root)) {
  const header = Buffer.alloc(4);
  const descriptor = openSync(file, 'r');
  readSync(descriptor, header, 0, 4, 0);
  closeSync(descriptor);
  if (!magics.has(header.toString('hex')) || !run('/usr/bin/file', ['-b', file]).includes('Mach-O')) continue;
  assert.equal(run('/usr/bin/lipo', ['-archs', file]), 'x86_64', `Wrong architecture: ${file}`);
  const commands = run('/usr/bin/otool', ['-l', file]);
  const minimums = [...commands.matchAll(/cmd LC_(?:BUILD_VERSION|VERSION_MIN_MACOSX)\b([\s\S]*?)(?=Load command|$)/g)];
  assert.ok(minimums.length > 0, `Missing macOS deployment target: ${file}`);
  for (const [, block] of minimums) {
    if (block.includes('minos')) {
      assert.match(block, /\bplatform (?:1|macos)\b/, `Not a macOS Mach-O: ${file}`);
    }
    const match = block.match(/\b(?:minos|version) (\d+)(?:\.(\d+))?(?:\.(\d+))?/);
    assert.ok(match, `Unreadable macOS deployment target: ${file}`);
    const [, major, minor = '0', patch = '0'] = match;
    assert.ok(Number(major) < 11 || (Number(major) === 11 && Number(minor) === 0 && Number(patch) === 0),
      `Deployment target exceeds 11.0: ${file} (${match[0]})`);
  }
  // Inspect load commands as well as delocate's resolved paths: an absolute build path would
  // work on this runner and still fail after installation. Only relative, wheel-local edges pass.
  const loads = commands.matchAll(/cmd LC_(?:LOAD_DYLIB|LOAD_WEAK_DYLIB|REEXPORT_DYLIB|LOAD_UPWARD_DYLIB)\b([\s\S]*?)(?=Load command|$)/g);
  for (const [, block] of loads) {
    const dependency = block.match(/\bname (.+?) \(offset \d+\)/)?.[1];
    assert.ok(dependency, `Unreadable dylib load command: ${file}`);
    if (system(dependency)) continue;
    assert.ok(dependency.startsWith('@loader_path/'), `Nonrelocatable dependency: ${file} -> ${dependency}`);
    const target = realpathSync(path.resolve(path.dirname(file), dependency.slice('@loader_path/'.length)));
    assert.ok(inside(target), `Dependency escapes wheel: ${file} -> ${dependency}`);
    assert.match(path.basename(target), /^(?:libRDKit|libboost_|libinchi)/,
      `Bundled library needs a licence inventory entry: ${target}`);
  }
  count += 1;
}
assert.ok(count > 0, 'Wheel contains no Mach-O files');
console.log(`Audited ${count} x86_64 Mach-O files; all deployment targets <= 11.0`);

const digest = createHash('sha256').update(readFileSync(wheel)).digest('hex');
writeFileSync(path.join(wheelhouse, 'SHA256SUMS'), `${digest}  ${wheels[0]}\n`);
const inputs = JSON.parse(readFileSync(path.join(work, 'inputs.json'), 'utf8'));
writeFileSync(path.join(work, 'smoke.txt'), [
  `rdkit==2026.3.5 --hash=sha256:${digest}`,
  ...inputs.wheels.filter(({ name }) => ['numpy', 'pillow'].includes(name))
    .map(({ name, version, sha256 }) => `${name}==${version} --hash=sha256:${sha256}`),
  '',
].join('\n'));
