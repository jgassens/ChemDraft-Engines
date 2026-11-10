#!/bin/bash
set -euo pipefail

# SDK/compiler, curl, make and Node come from the hosted runner; no Homebrew installs.
export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
cd "$WORK/src/python"
./configure --prefix="$WORK/python" --with-ensurepip=install
make -j3
make install
"$WORK/python/bin/python3.12" -m venv "$WORK/tools"
"$WORK/tools/bin/python3.12" -m pip install --no-index --require-hashes \
  --only-binary=:all: --find-links="$WORK/downloads" -r "$WORK/tools.txt"
"$WORK/tools/bin/python3.12" -m pip check
cd "$WORK/src/cmake"
./bootstrap --prefix="$WORK/cmake" --parallel=3 -- -DCMAKE_USE_OPENSSL=OFF
make -j3
make install
