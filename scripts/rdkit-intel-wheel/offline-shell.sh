#!/bin/bash
set -euo pipefail

if [[ -z "${RUNNER_TEMP:-}" ]]; then
  echo "Error: RUNNER_TEMP is unset or empty" >&2
  exit 1
fi
if [[ ! -f "$RUNNER_TEMP/rdkit-intel/offline.sb" ]]; then
  echo "Error: sandbox profile not found: $RUNNER_TEMP/rdkit-intel/offline.sb" >&2
  exit 1
fi
exec /usr/bin/sandbox-exec -f "$RUNNER_TEMP/rdkit-intel/offline.sb" /bin/bash --noprofile --norc -e -o pipefail "$1"
