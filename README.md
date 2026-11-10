# ChemDraft Engines

Build workflows for native engine packages intended for [ChemDraft](https://github.com/jgassens/ChemDraft), for platforms where no suitable package exists upstream. ChemDraft's release-download integration is planned.

## RDKit for Intel Macs

ChemDraft's naming engine needs RDKit 2026.3.5 for Python 3.12. PyPI has no macOS x86_64 wheel for it, so `.github/workflows/rdkit-intel-wheel.yml` builds one from the official `Release_2026_03_5` source on a GitHub-hosted Intel macOS runner:

- Inputs (CPython, CMake, Boost, Eigen, Catch2, better-enums, InChI, the RDKit source and the Python build tools) must have reviewed SHA-256 pins in `scripts/rdkit-intel-wheel/inputs.json` and the workflow. Fetching refuses incomplete pins before any download and checks each archive before extraction.
- The repository owns its CPython 3.12 Intel Mac NumPy 2.5.4 and Pillow 13.0.0 smoke pins in `scripts/rdkit-intel-wheel/smoke-requirements.txt`; fetching checks them against `inputs.json`.
- The build itself runs offline.
- The wheel targets macOS 11 or later and x86_64 only. Its bundled libraries are checked for architecture and minimum macOS version.
- It is smoke-tested from a moved virtual environment with the build folders hidden.
- The upstream licence texts (RDKit, Boost, Eigen, InChI and better-enums) ship inside the wheel's `.dist-info/licenses/` folder. InChI's bundled TBB licence is retained with a label explaining that TBB is not compiled into the wheel.

The workflow runs only when started by hand, and uploads the wheel and its `SHA256SUMS` as a workflow artifact. Future GitHub release publication will require review. ChemDraft is planned to pin each release file by SHA-256 and download only those exact URLs; this workflow implements artifact upload only.

Build choices and upstream source references are recorded in [the build notes](scripts/rdkit-intel-wheel/BUILD_NOTES.md).

## Licence

The workflow and scripts in this repository are MIT-licensed (see `LICENSE`). The wheels they build contain RDKit (BSD-3-Clause) and its dependencies under their own licences, which are included in each wheel.
