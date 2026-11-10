# Intel RDKit wheel build notes

Source references below are relative to the upstream RDKit `Release_2026_03_5`
and InChI `v1.07.5` trees. They were inspected locally; no build, installation,
workflow dispatch or network request was performed for this change.

## Required inputs

Boost **1.87.0** is selected as the first release with Boost.NumPy support for
NumPy 2, replacing direct access to the removed `PyArray_Descr::elsize` layout.
RDKit accepts it: `rdkit/CMakeLists.txt:93` sets a minimum of 1.81.0, and
`rdkit/CMakeLists.txt:341` requires both the Python and NumPy components for the
selected interpreter. The Boost 1.87.0 source and release history were not
available locally, so the integrator must confirm the NumPy 2 change and the
earliest-release claim when downloading it. The relevant upstream locations are
[the release notes](https://www.boost.org/users/history/version_1_87_0.html) and
[dtype.cpp](https://github.com/boostorg/python/blob/boost-1.87.0/src/numpy/dtype.cpp).

The workflow replaces bootstrap's generated `project-config.jam` with an
explicit Python 3.12 configuration: the tools venv provides the interpreter and
NumPy, while `$WORK/python/include/python3.12` provides the base interpreter's
headers. The library selection and install prefix are passed explicitly to b2
because the generated project configuration is replaced.

RDKit declares Catch2 **v3.4.0** at `rdkit/CMakeLists.txt:184` and better-enums
**c35576bed0295689540b39873126129adfa0b4c8** (0.11.3) at
`rdkit/CMakeLists.txt:196`. `rdkit/Code/RDGeneral/CMakeLists.txt:8` populates
better-enums and copies its `enum.h`. Both tarballs are staged before the offline
build and supplied through `FETCHCONTENT_SOURCE_DIR_CATCH2` and
`FETCHCONTENT_SOURCE_DIR_BETTER_ENUMS`. Catch2 package discovery is disabled so
the host cannot override the staged version. Catch2's own tests and examples are
disabled along with RDKit's C++ tests.

The SHA-256 of each of these exact URLs was checked against a fresh download
(2026-11-10) and is pinned in `inputs.json`:

| Input | URL |
| --- | --- |
| Boost 1.87.0 | https://github.com/boostorg/boost/releases/download/boost-1.87.0/boost-1.87.0-b2-nodocs.tar.xz |
| Catch2 v3.4.0 | https://github.com/catchorg/Catch2/archive/refs/tags/v3.4.0.tar.gz |
| better-enums 0.11.3 commit | https://github.com/aantron/better-enums/archive/c35576bed0295689540b39873126129adfa0b4c8.tar.gz |

## InChI staging and linkage

Configure only `inchi/INCHI-1-SRC/INCHI_API/libinchi/src`: its `CMakeLists.txt:16`
sets the library output directory, `:29` creates the shared `libinchi` target,
and `:165` removes the automatic `lib` prefix. The file has no install rules,
so the workflow copies `build-inchi/lib/libinchi.dylib` into `prefix/lib`.
The repository root is unsuitable for offline builds because
`inchi/CMakeLists.txt:12` unconditionally fetches googletest.

`rdkit/External/INCHI-API/inchi.cpp:64` includes `inchi_api.h` and `bcf_s.h`.
`inchi/INCHI-1-SRC/INCHI_BASE/src/inchi_api.h:1413` also includes `ixa.h`.
All three headers are copied side by side into `prefix/include/inchi`;
`rdkit/Code/cmake/Modules/FindInchi.cmake:18` searches for `inchi_api.h` directly
inside the include directory, and `:38` adds that directory to the include path.
Its cached-values branch at `:14` does not set the plural link variable, so
`INCHI_LIBRARIES` is passed explicitly for
`rdkit/External/INCHI-API/CMakeLists.txt:82` to link RDInchiLib.

`inchi/INCHI-1-SRC/INCHI_BASE/src/mode.h:228` leaves `USE_TBB_MALLOC` undefined;
the library's `CMakeLists.txt:154` does not enable it. The workflow also passes
`-UUSE_TBB_MALLOC`. Packaging retains `INCHI-1-SRC/INCHI_API/tbb/LICENSE`, writes
the required reference-only label beside it, and asserts both files and the
top-level InChI licence are present. Metadata paths are relative to
`.dist-info/licenses`, including the label.

## Offline RDKit configuration and wheel layout

- Optional shape and document-format modules are disabled. Their entry points
  are guarded at `rdkit/External/CMakeLists.txt:8` and `:12`; the corresponding
  defaults are at `rdkit/CMakeLists.txt:65` and `:57`.
- Avalon, FreeSASA, coordinate generation, MAE parsing, YAeHMOP and ring
  decomposition downloads are guarded by the options in
  `rdkit/External/AvalonTools/CMakeLists.txt:1`,
  `rdkit/External/FreeSASA/CMakeLists.txt:1`,
  `rdkit/External/CoordGen/CMakeLists.txt:4` and `:59`,
  `rdkit/External/YAeHMOP/CMakeLists.txt:1`, and
  `rdkit/External/RingFamilies/CMakeLists.txt:3`. All are disabled.
- Contrib is guarded at `rdkit/CMakeLists.txt:618`, and xyz2mol at
  `rdkit/Code/GraphMol/CMakeLists.txt:105`; both are disabled. C++ tests are
  guarded at `rdkit/Code/cmake/Modules/RDKitUtils.cmake:225` and `:239`.
  SWIG wrappers and the database cartridge remain disabled
  (`rdkit/CMakeLists.txt:24`, `:29`, `:118`).
- Font downloads are guarded at
  `rdkit/Code/GraphMol/MolDraw2D/CMakeLists.txt:13`. Font fetching and FreeType
  are disabled, as are Cairo and Qt drawing backends.
- The optional 3D descriptor fallback downloads Eigen
  (`rdkit/CMakeLists.txt:419`, `rdkit/External/Eigen/CMakeLists.txt:4`), so 3D
  descriptors are disabled. The existing pinned Eigen headers remain available
  through `EIGEN3_INCLUDE_DIR`; discovery accepts that directory at
  `rdkit/Code/cmake/Modules/FindEigen3.cmake:69` and creates its target at `:105`.
- RapidJSON is no longer used by this tag's CMake. MolInterchange uses Boost.JSON
  (`rdkit/Code/GraphMol/MolInterchange/CMakeLists.txt:6` and `Parser.cpp:41`), so
  the obsolete input, staging, CMake variable and licence requirement are removed.
- `PYTHON_INSTDIR` is consumed at `rdkit/CMakeLists.txt:348` and sets the package
  location at `:362`; the workflow now uses it. Packaging retains the relocatable
  RDPaths and Data copy used by `rdkit/rdkit/RDConfig.py:28`. The workflow creates
  `$WORK/raw` before packing the wheel.

SMILES parsing, canonicalization and stereo perception remain in the core
GraphMol build (`rdkit/Code/GraphMol/CMakeLists.txt:4`, `:7`, `:9`, `:55`).
InChI and RDConfig data remain enabled and exercised by the existing relocated
venv smoke test. The sandbox, SHA-256 checks, pinned actions, read-only workflow
permissions, credential setting, architecture/deployment audit and artifact-only
upload are retained.

The new source archives and their licence filenames still need confirmation
when downloaded. The macOS build, delocation and relocation smoke test remain
unverified here because only the four requested static checks are permitted.
