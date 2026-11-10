import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const work = process.env.WORK;
assert.ok(work, 'WORK must name the build directory');
function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* files(file);
    else if (entry.isFile()) yield file;
  }
}
const extensions = [...files(path.join(work, 'stage'))]
  .filter((file) => /^rdBase(?:\..*)?\.so$/.test(path.basename(file)));
assert.equal(extensions.length, 1, 'Expected exactly one installed rdkit/rdBase extension');
const root = path.join(work, 'wheel');
const rdkit = path.join(root, 'rdkit');
mkdirSync(root, { recursive: true });
cpSync(path.dirname(extensions[0]), rdkit, { recursive: true });
cpSync(path.join(work, 'src/rdkit/Data'), path.join(rdkit, 'Data'), { recursive: true });

// RDKit's CMake-generated RDPaths otherwise remembers the build machine's install prefix.
writeFileSync(path.join(rdkit, 'RDPaths.py'), [
  'import os',
  'RDCodeDir = os.path.dirname(os.path.abspath(__file__))',
  '_share = RDCodeDir',
  'RDBaseDir = RDCodeDir',
  'RDDataDir = os.path.join(RDCodeDir, "Data")',
  'RDDocsDir = os.path.join(RDCodeDir, "Docs")',
  'RDProjDir = os.path.join(RDCodeDir, "Projects")',
  'RDContribDir = os.path.join(RDCodeDir, "Contrib")',
  '',
].join('\n'));

const info = path.join(root, 'rdkit-2026.3.5.dist-info');
const licenses = path.join(info, 'licenses');
mkdirSync(licenses, { recursive: true });
const licenseFiles = [];
for (const component of ['rdkit', 'boost', 'eigen', 'rapidjson', 'inchi']) {
  const source = path.join(work, 'src', component);
  let count = 0;
  // Keep upstream texts verbatim, including embedded-code and font notices. Preserve the source
  // layout so equally named notices cannot overwrite each other. Build tools are not redistributed.
  for (const file of files(source)) {
    if (!/^(licen[cs]e|copying|copyright|notice)([._-].*)?$/i.test(path.basename(file)) &&
        !/licen[cs]e\.txt$/i.test(path.basename(file))) continue;
    const relative = path.join(component, path.relative(source, file));
    const destination = path.join(licenses, relative);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(file, destination);
    licenseFiles.push(`licenses/${relative.split(path.sep).join('/')}`);
    count += 1;
  }
  assert.ok(count > 0, `No upstream licence texts found for ${component}`);
}
for (const required of ['rdkit/license.txt', 'boost/LICENSE_1_0.txt', 'eigen/COPYING.MPL2',
  'rapidjson/license.txt', 'inchi/LICENSE']) {
  assert.ok(existsSync(path.join(licenses, required)), `Required licence missing: ${required}`);
}
writeFileSync(path.join(info, 'build-inputs.json'), readFileSync(path.join(work, 'inputs.json')));
writeFileSync(path.join(info, 'WHEEL'), [
  'Wheel-Version: 1.0',
  'Generator: ChemDraft Intel RDKit build',
  'Root-Is-Purelib: false',
  'Tag: cp312-cp312-macosx_11_0_x86_64',
  '',
].join('\n'));
writeFileSync(path.join(info, 'METADATA'), [
  'Metadata-Version: 2.4',
  'Name: rdkit',
  'Version: 2026.3.5',
  'Summary: RDKit naming-engine build for Intel Macs',
  'License: BSD-3-Clause; bundled-library notices are in licenses/',
  'Requires-Python: >=3.12,<3.13',
  'Requires-Dist: numpy',
  'Requires-Dist: Pillow',
  ...licenseFiles.sort().map((file) => `License-File: ${file}`),
  '',
  'Built from the official Release_2026_03_5 tag. See build-inputs.json for input pins.',
  '',
].join('\n'));
