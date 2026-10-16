#!/bin/sh
# Schrijft de huidige git commit hash naar js/version.js (voor de console-melding bij opstarten).
# Let op: als je het gestempelde bestand zelf commit, is de hash die van de vorige commit.
cd "$(dirname "$0")/.." || exit 1
hash=$(git rev-parse --short HEAD)
git diff --quiet HEAD -- . ':!js/version.js' || hash="$hash-dirty"
cat > js/version.js <<EOT
// Wordt overschreven door scripts/stamp-version.sh met de git commit hash.
export const VERSION = "$hash";
EOT
echo "js/version.js -> $hash"
