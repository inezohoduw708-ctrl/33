#!/usr/bin/env bash
# Regenerate every QA screenshot into shots/ (software raycast render, no GPU needed).
set -e
cd "$(dirname "$0")/.."
mkdir -p shots
npx esbuild tests/scene_shot.ts --bundle --platform=node --format=cjs --outfile=tests/shot.cjs --loader:.ts=ts --external:jsdom --log-level=warning
node tests/shot.cjs
npx esbuild tests/closeup.ts --bundle --platform=node --format=cjs --outfile=tests/closeup.cjs --loader:.ts=ts --external:jsdom --log-level=warning
node tests/closeup.cjs
npx esbuild tests/battle_shot.ts --bundle --platform=node --format=cjs --outfile=tests/battle.cjs --loader:.ts=ts --external:jsdom --log-level=warning
node tests/battle.cjs
npx esbuild tests/menu_shot.ts --bundle --platform=node --format=cjs --outfile=tests/menu.cjs --loader:.ts=ts --external:jsdom --log-level=warning
node tests/menu.cjs
python3 tests/ui_shot.py
echo "all shots in shots/"
