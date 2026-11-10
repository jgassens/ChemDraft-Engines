#!/bin/bash
set -euo pipefail

export SDKROOT="$(xcrun --sdk macosx --show-sdk-path)"
cd "$WORK/src/boost"
./bootstrap.sh --prefix="$WORK/prefix" --with-toolset=clang \
  --with-python="$WORK/tools/bin/python3.12" --with-python-version=3.12 \
  --with-libraries=python,serialization,iostreams,system
# Replace bootstrap's venv-derived include path with the base CPython headers.
cat > project-config.jam <<EOF
using clang ;
using python : 3.12 : "$WORK/tools/bin/python3.12" : "$WORK/python/include/python3.12" : "$WORK/python/lib" ;
EOF
# RDStreams uses gzip even with compressed suppliers disabled. Use only SDK libz.
./b2 -j3 install --prefix="$WORK/prefix" \
  --with-python --with-serialization --with-iostreams --with-system \
  toolset=clang variant=release link=shared threading=multi \
  python=3.12 architecture=x86 address-model=64 \
  cxxflags="-isysroot $SDKROOT -arch x86_64 -mmacosx-version-min=11.0" \
  linkflags="-isysroot $SDKROOT -arch x86_64 -mmacosx-version-min=11.0" \
  -sZLIB_INCLUDE="$SDKROOT/usr/include" -sZLIB_LIBPATH="$SDKROOT/usr/lib" \
  -sNO_BZIP2=1 -sNO_LZMA=1 -sNO_ZSTD=1
cmake -S "$WORK/src/inchi/INCHI-1-SRC/INCHI_API/libinchi/src" -B "$WORK/build-inchi" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_C_FLAGS=-UUSE_TBB_MALLOC \
  -DCMAKE_OSX_ARCHITECTURES=x86_64 -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0 \
  -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --build "$WORK/build-inchi" --target libinchi --parallel 3
# The library subproject has no install rules; stage its API and transitive header.
mkdir -p "$WORK/prefix/lib" "$WORK/prefix/include/inchi"
cp "$WORK/build-inchi/lib/libinchi.dylib" "$WORK/prefix/lib/"
for header in inchi_api.h bcf_s.h ixa.h; do
  cp "$WORK/src/inchi/INCHI-1-SRC/INCHI_BASE/src/$header" "$WORK/prefix/include/inchi/"
done

# Stage Eigen alongside the other dependencies so the cache holds the complete prefix.
cmake -S "$WORK/src/eigen" -B "$WORK/build-eigen" \
  -DCMAKE_INSTALL_PREFIX="$WORK/prefix" -DBUILD_TESTING=OFF \
  -DEIGEN_BUILD_DOC=OFF -DCMAKE_POLICY_VERSION_MINIMUM=3.5
cmake --install "$WORK/build-eigen"
