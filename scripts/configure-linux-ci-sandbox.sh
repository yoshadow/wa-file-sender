#!/usr/bin/env bash
set -euo pipefail

# Scoped exception on an ephemeral Ubuntu runner: Chromium still uses its sandbox.
# Never run this script on the user's computer or disable user namespaces globally.
if [[ "${GITHUB_ACTIONS:-}" != "true" || "${RUNNER_OS:-}" != "Linux" ]]; then
  echo 'Este ajuste es exclusivo del runner Linux de GitHub Actions.' >&2
  exit 1
fi

profile_file="${RUNNER_TEMP:?}/wa-file-sender-userns.apparmor"
workspace="${GITHUB_WORKSPACE:?}"
cat > "$profile_file" <<PROFILE
abi <abi/4.0>,
include <tunables/global>

profile wa-file-sender-electron "$workspace/node_modules/electron/dist/electron" flags=(unconfined) {
  userns,
}
profile wa-file-sender-chrome "$workspace/.cache/bundled-browser/chrome" flags=(unconfined) {
  userns,
}
profile wa-file-sender-package "$workspace/dist/linux-unpacked/wa-file-sender" flags=(unconfined) {
  userns,
}
profile wa-file-sender-package-chrome "$workspace/dist/linux-unpacked/resources/browser/chrome" flags=(unconfined) {
  userns,
}
PROFILE
sudo apparmor_parser -r "$profile_file"
