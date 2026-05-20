#!/bin/zsh

set -e

PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$PROJECT_DIR"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ -s "$HOME/.nvm/nvm.sh" ]; then
  export NVM_DIR="$HOME/.nvm"
  . "$NVM_DIR/nvm.sh"
fi

if command -v fnm >/dev/null 2>&1; then
  eval "$(fnm env --use-on-cd)"
fi

if [ -s "$HOME/.asdf/asdf.sh" ]; then
  . "$HOME/.asdf/asdf.sh"
fi

DEV_HOST="${DEV_HOST:-127.0.0.1}"
DEV_PORT="${DEV_PORT:-3000}"
PNPM_CMD=(pnpm)

echo ""
echo "Starting Gesture Bridge web server..."
echo "Project: $PROJECT_DIR"
echo "URL: http://$DEV_HOST:$DEV_PORT"
echo "Stop: press Control-C in this window."
echo ""

if ! command -v pnpm >/dev/null 2>&1; then
  if command -v corepack >/dev/null 2>&1; then
    PNPM_CMD=(corepack pnpm)
  else
    echo "Error: pnpm is required, but pnpm/corepack was not found."
    echo "Install Node.js first, then run this file again."
    exit 1
  fi
fi

if [ ! -d node_modules ]; then
  echo "node_modules was not found. Installing dependencies..."
  "${PNPM_CMD[@]}" install --frozen-lockfile
  echo ""
fi

"${PNPM_CMD[@]}" dev --hostname "$DEV_HOST" --port "$DEV_PORT"
