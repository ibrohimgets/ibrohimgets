#!/usr/bin/env bash
# Downloads the two free Piper voice models used for the dialogue (~140 MB) into build/voices.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/voices
base="https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US"
for v in amy/medium/en_US-amy-medium libritts_r/medium/en_US-libritts_r-medium; do
  n=$(basename "$v")
  for ext in onnx onnx.json; do
    [ -f "build/voices/$n.$ext" ] || curl -L --fail -o "build/voices/$n.$ext" "$base/$v.$ext"
  done
done
echo "Voices ready in build/voices"
