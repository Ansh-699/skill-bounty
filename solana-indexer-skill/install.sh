#!/usr/bin/env bash
set -euo pipefail

# Install solana-indexer skill to ~/.claude/skills/solana-indexer/
# Usage: ./install.sh [-y]

SKILL_DIR="$HOME/.claude/skills/solana-indexer"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
AUTO_YES=false

if [[ "${1:-}" == "-y" ]]; then
  AUTO_YES=true
fi

if [[ -d "$SKILL_DIR" ]] && [[ "$AUTO_YES" != true ]]; then
  echo "⚠️  Skill directory already exists: $SKILL_DIR"
  read -rp "Overwrite? [y/N] " confirm
  if [[ "$confirm" != [yY] ]]; then
    echo "Aborted."
    exit 0
  fi
fi

echo "📦 Installing solana-indexer skill..."

# Create skill directory
mkdir -p "$SKILL_DIR"

# Copy skill files
cp "$SCRIPT_DIR/SKILL.md" "$SKILL_DIR/"
cp -r "$SCRIPT_DIR/skill/" "$SKILL_DIR/skill/"
cp -r "$SCRIPT_DIR/agents/" "$SKILL_DIR/agents/"
cp -r "$SCRIPT_DIR/commands/" "$SKILL_DIR/commands/"
cp -r "$SCRIPT_DIR/examples/" "$SKILL_DIR/examples/"

echo "✅ Installed to $SKILL_DIR"
echo ""
echo "Skill files:"
find "$SKILL_DIR" -type f | sort | sed 's|^|  |'
echo ""
echo "🚀 Ready! Ask your agent:"
echo '   "Index every USDC transfer for this program into Postgres"'
echo '   "My indexer is double-counting swaps — fix it"'
echo '   "/scaffold-indexer"'
