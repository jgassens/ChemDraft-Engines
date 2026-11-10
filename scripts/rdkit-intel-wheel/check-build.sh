#!/bin/bash
set -euo pipefail

check_arch() {
  local binary="$1"
  local archs
  archs="$(lipo -archs "$binary")"
  if [[ "$archs" != x86_64 ]]; then
    echo "Expected x86_64 for $binary, got: $archs" >&2
    exit 1
  fi
}

case "${1:-}" in
  tools)
    test "$("$WORK/python/bin/python3.12" --version)" = 'Python 3.12.15'
    test "$("$WORK/tools/bin/python3.12" --version)" = 'Python 3.12.15'
    test "$("$WORK/cmake/bin/cmake" --version | head -n 1)" = 'cmake version 4.4.4'
    for binary in "$WORK/python/bin/python3.12" "$WORK/tools/bin/python3.12" \
      "$WORK/cmake/bin/cmake" "$WORK/cmake/bin/ctest" "$WORK/cmake/bin/cpack"; do
      check_arch "$binary"
    done
    roots=("$WORK/python" "$WORK/tools" "$WORK/cmake")
    ;;
  dependencies)
    check_arch "$WORK/prefix/lib/libinchi.dylib"
    compgen -G "$WORK/prefix/lib/libboost_*.dylib" > /dev/null
    boost_iostreams=("$WORK"/prefix/lib/libboost_iostreams*.dylib)
    test -f "${boost_iostreams[0]}"
    for library in "${boost_iostreams[@]}"; do
      symbols="$(nm -gU "$library")"
      [[ "$symbols" == *zlib_error* && "$symbols" == *gzip* ]]
      linkage="$(otool -L "$library")"
      [[ "$linkage" == *'/usr/lib/libz.1.dylib'* ]]
    done
    grep -Eq 'set\([[:space:]]*PACKAGE_VERSION[[:space:]]+"?1\.87\.0"?[[:space:]]*\)' \
      "$WORK/prefix/lib/cmake/Boost-1.87.0/BoostConfigVersion.cmake"
    test -f "$WORK/prefix/include/eigen3/Eigen/Core"
    roots=("$WORK/prefix")
    ;;
  *)
    echo 'Usage: check-build.sh tools|dependencies' >&2
    exit 1
    ;;
esac

# Check native modules as well as dylibs and Mach-O executables; skip script entry points.
find "${roots[@]}" \( -type d -path '*/site-packages/*' \( -name tests -o -name test \) -prune \) -o \
  \( -type f \( -name '*.dylib' -o -name '*.so' -o -perm -111 \) -print0 \) |
  while IFS= read -r -d '' binary; do
    case "$binary" in
      *.dylib|*.so) check_arch "$binary" ;;
      *)
        case "$(file -b "$binary")" in
          *Mach-O*) check_arch "$binary" ;;
        esac
        ;;
    esac
  done
