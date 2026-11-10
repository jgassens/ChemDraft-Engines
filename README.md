# ChemDraft Engines

Build workflows for the native engine packages that [ChemDraft](https://github.com/jgassens/ChemDraft) installs on request, for platforms where no suitable package exists upstream.

## RDKit for Intel Macs

ChemDraft's naming engine needs RDKit 2026.3.5 for Python 3.12. PyPI has no macOS x86_64 wheel for it, so `.github/workflows/rdkit-intel-wheel.yml` builds one from the official `Release_2026_03_5` source on a GitHub-hosted Intel macOS runner:

- Every input (CPython, CMake, Boost, Eigen, RapidJSON, InChI, the RDKit source and the Python build tools) is pinned by SHA-256 in `scripts/rdkit-intel-wheel/inputs.json` and the workflow, and checked before use.
- The build itself runs offline.
- The wheel targets macOS 11 or later and x86_64 only. Its bundled libraries are checked for architecture and minimum macOS version.
- It is smoke-tested from a moved virtual environment with the build folders hidden.
- The upstream licence texts (RDKit, Boost, Eigen, RapidJSON, InChI) ship inside the wheel's `licenses/` folder.

The workflow runs only when started by hand, and uploads the wheel and its `SHA256SUMS` as a workflow artifact. A wheel is published as a GitHub release only after review. ChemDraft pins each release file by SHA-256 and downloads only those exact URLs.

## Licence

The workflow and scripts in this repository are MIT-licensed (see `LICENSE`). The wheels they build contain RDKit (BSD-3-Clause) and its dependencies under their own licences, which are included in each wheel.
