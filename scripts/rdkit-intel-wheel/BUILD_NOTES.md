# Intel RDKit wheel build notes

Source references below are relative to the upstream RDKit `Release_2026_03_5`
and InChI `v1.07.5` trees.

## Build caches

The two build caches are an optimisation. One stores the finished CPython,
tools venv and CMake installs; the other stores the Boost, InChI and Eigen prefix.
Both keys include the runner OS, architecture, image OS/version, deployment
target and a manual `-v1` suffix. The tools key hashes `build-tools.sh` and
`check-build.sh`, plus a SHA-256 of the CPython/CMake source entries and every
wheel entry in `inputs.json` (all wheels are installed in the tools venv).
The dependency key hashes `build-deps.sh` and `check-build.sh`, plus a SHA-256
of the Boost/InChI/Eigen source entries, and includes the full tools cache key.
Changes to the tool build therefore also invalidate the dependency cache.
Neither key hashes the workflow or unrelated scripts, so RDKit build,
packaging, audit and smoke-step edits leave both caches reusable.
Only an exact key hit permits restoration; there are no restore keys.
Lookup-only steps reject prefix matches before restoration, and a changed
match between lookup and restore fails the job before using the build.

Downloads and checksum verification still run every time. Build and verification
steps remain in the offline sandbox; cache lookup, restore and save steps run
outside it and transfer only the install folders. Restored Python must report
`Python 3.12.15`, and the native executables, dylibs and extension modules are
checked with `lipo -archs` for exactly `x86_64`. Finished builds are checked and
saved immediately. Eigen staging is part of `build-deps.sh` and the cached
prefix; the dependency cache is saved before the smoke test moves it.

A release wheel should come from a run with both caches cleared, or with a fresh
manual key suffix, so it is built end to end. Each run records the tools and
dependency cache-hit status in the job summary. The workflow remains manual
dispatch only, with `contents: read` and checkout credentials disabled; caches
are scoped to the default branch.

## Required inputs

Boost **1.87.0** is selected as the first release with Boost.NumPy support for
NumPy 2, replacing direct access to the removed `PyArray_Descr::elsize` layout.
RDKit accepts it: `rdkit/CMakeLists.txt:93` sets a minimum of 1.81.0, and
`rdkit/CMakeLists.txt:341` requires both the Python and NumPy components for the
selected interpreter. Boost 1.87.0 uses `PyDataType_ELSIZE` when
`NPY_ABI_VERSION >= 0x02000000`. The relevant upstream locations are
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
disabled along with RDKit's C++ tests. See the first-run corrections below for
excluding the Catch2 libraries themselves from the default build.

The SHA-256 of each of these exact URLs was checked against a fresh download
(2026-11-10) and is pinned in `inputs.json`:

| Input | URL |
| --- | --- |
| Boost 1.87.0 | https://github.com/boostorg/boost/releases/download/boost-1.87.0/boost-1.87.0-b2-nodocs.tar.xz |
| Catch2 v3.4.0 | https://github.com/catchorg/Catch2/archive/refs/tags/v3.4.0.tar.gz |
| better-enums 0.11.3 commit | https://github.com/aantron/better-enums/archive/c35576bed0295689540b39873126129adfa0b4c8.tar.gz |

## First-run linker failure and warnings

The complete first failed-run log ends at the RDStreams link failure; it does
not reach packaging, delocation, the wheel audit or the smoke test.

`rdkit/Code/RDStreams/CMakeLists.txt:2` always creates RDStreams from
`streams.cpp`. `rdkit/Code/RDStreams/streams.h:7` includes Boost's gzip filter,
and `rdkit/Code/RDStreams/streams.cpp:8` constructs `gzip_decompressor` when
Boost.Iostreams is enabled. Disabling compressed suppliers does not remove this
requirement. The old b2 `NO_ZLIB=1` omitted Boost's zlib/gzip implementations,
causing the undefined `boost::iostreams::zlib_error::check(int)`, `gzip_error`
and related symbols in the log. Removing that setting and passing
`ZLIB_LIBPATH=$SDKROOT/usr/lib` enables those implementations using the SDK's
system libz; the sysroot supplies the headers. Both b2 compilation and
linking explicitly use that sysroot, x86_64 and deployment target 11.0.
No zlib source is downloaded or bundled; the resulting dependency is the macOS
system `/usr/lib/libz.1.dylib`, available on macOS 11 and later.
RDStreams uses no bzip2, lzma or zstd filters, so all three stay disabled.
Shared Boost linkage is inherited through `rdkit_base` at
`rdkit/Code/cmake/Modules/RDKitUtils.cmake:90` and
`rdkit/CMakeLists.txt:460`; the extra direct zlib linkage at `:476` is only for
static Boost builds and is not needed here.

The TBB warning is harmless: the optional `find_package(TBB)` at
`rdkit/Code/GraphMol/FileParsers/CMakeLists.txt:133` only changes linkage of an
iterator C++ test, with a fallback at `:138`. C++ test creation is guarded by
`RDK_BUILD_CPP_TESTS` at `rdkit/Code/cmake/Modules/RDKitUtils.cmake:239`.
There is no RDKit-specific TBB switch in this tag; the supported CMake option
`CMAKE_DISABLE_FIND_PACKAGE_TBB=ON` stops that optional lookup. This does not
disable thread-safe substructure searching or alter InChI's allocator settings.

`rdkit/CMakeLists.txt:180` and `:190` find/add Catch2 unconditionally, outside
the C++ test guard. `CATCH_BUILD_TESTING=OFF` only disables Catch2's own tests;
it does not disable its libraries. This tag has no RDKit option to skip that
FetchContent call. The supported CMake
[`CMAKE_PROJECT_Catch2_INCLUDE`](https://cmake.org/cmake/help/latest/variable/CMAKE_PROJECT_PROJECT-NAME_INCLUDE.html)
hook loads `catch2-exclude.cmake` in Catch2's directory during `project()`.
It sets CMake's `EXCLUDE_FROM_ALL` directory property, excluding the unused
Catch2 libraries and their install rules from the parent build. Their targets
remain available, but with RDKit's C++ tests off there are no consumers to build
them. The checksummed source override and offline FetchContent settings remain.

The logged CMP0144 warning says the uppercase `BOOST_ROOT` is ignored, and
`Boost_NO_SYSTEM_PATHS` is unused because RDKit requests Boost in CONFIG mode
(`rdkit/CMakeLists.txt:341`, `:452`, `:462`). `Boost_DIR` now selects the exact
installed `prefix/lib/cmake/Boost-1.87.0` configuration, avoiding reliance on
host Boost discovery. The Eigen CMP0146 deprecation, absent Fortran compiler,
disabled Qt demos and absent nbval messages are harmless for this headers-only
Eigen installation and disabled tests; they do not indicate another build
failure in the log.

`scripts/rdkit-intel-wheel/audit.mjs:17` already accepts `/usr/lib/` and
`/System/` dependencies. Both its delocate dependency check at `:23` and its
Mach-O load-command check at `:65` therefore allow `/usr/lib/libz.1.dylib`.
No audit exception is needed. Delocate leaves this system library external;
every Mach-O shipped in the wheel must still be exactly x86_64 with deployment
target at most 11.0. All hash checks, action pins, sandbox restrictions and the
relocated smoke test remain in place.

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
