# RDKit 2026.03.5 calls FetchContent_MakeAvailable(Catch2) even with its C++ tests
# disabled. CMAKE_PROJECT_Catch2_INCLUDE runs this in Catch2's directory during
# project(), before its targets are created. CMake's supported directory property
# excludes those unused libraries (and their install rules) from the parent build.
set_property(DIRECTORY PROPERTY EXCLUDE_FROM_ALL TRUE)
