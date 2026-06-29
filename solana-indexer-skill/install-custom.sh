#!/usr/bin/env bash
set -euo pipefail

# Install solana-indexer skill to a custom path.
# Usage: ./install-custom.sh [TARGET_DIR]
#
# If no TARGET_DIR is provided, prompts interactively.
# Supports personal (~/.claude/skills), project (.claude/skills), or any custom path.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [[ -n "${1:-}" ]]; then
  TARGET="$1"
else
  echo "Where would you like to install the solana-indexer skill?"
  echo ""
  echo "  1) Personal   (~/.claude/skills/solana-indexer)"
  echo "  2) Project     (./.claude/skills/solana-indexer)"
  echo "  3) Custom path"
  echo ""
  read -rp "Choice [1/2/3]: " choice
  case "$choice" in
    1) TARGET="$HOME/.claude/skills/solana-indexer" ;;
    2) TARGET="./.claude/skills/solana-indexer" ;;
    3) read -rp "Enter path: " TARGET ;;
    *) echo "Invalid choice."; exit 1 ;;
  esac
fi

# Expand ~ if present
TARGET="${TARGET/#\~/$HOME}"

echo "📦 Installing to: $TARGET"
mkdir -p "$TARGET"

cp "$SCRIPT_DIR/SKILL.md" "$TARGET/"
cp -r "$SCRIPT_DIR/skill/" "$TARGET/skill/"
cp -r "$SCRIPT_DIR/agents/" "$TARGET/agents/"
cp -r "$SCRIPT_DIR/commands/" "$TARGET/commands/"
cp -r "$SCRIPT_DIR/examples/" "$TARGET/examples/"

echo "✅ Installed to $TARGET"
echo ""
echo "Files:"
find "$TARGET" -type f | sort | sed 's|^|  |'
