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
    for binary in "$WORK/python/bin/python3.12" "$WORK/tools/bin/python3.12" \
      "$WORK/cmake/bin/cmake" "$WORK/cmake/bin/ctest" "$WORK/cmake/bin/cpack"; do
      check_arch "$binary"
    done
    roots=("$WORK/python" "$WORK/tools" "$WORK/cmake")
    ;;
  dependencies)
    check_arch "$WORK/prefix/lib/libinchi.dylib"
    compgen -G "$WORK/prefix/lib/libboost_*.dylib" > /dev/null
    roots=("$WORK/prefix")
    ;;
  *)
    echo 'Usage: check-build.sh tools|dependencies' >&2
    exit 1
    ;;
esac

# Check native modules as well as dylibs and Mach-O executables; skip script entry points.
find "${roots[@]}" -type f \( -name '*.dylib' -o -name '*.so' -o -perm -111 \) -print0 |
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
