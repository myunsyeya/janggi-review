#!/bin/zsh
# Puts the engine files into public/engine (they are not in git: big, and reproducible).
set -e
cd "$(dirname "$0")/.."
mkdir -p public/engine
cp node_modules/fairy-stockfish-nnue.wasm/stockfish.{js,wasm,worker.js} node_modules/ffish-es6/ffish.wasm public/engine/
NNUE=public/engine/janggi-9991472750de.nnue
if [[ ! -f $NNUE ]]; then
  curl -fsSL -o $NNUE "https://drive.usercontent.google.com/download?id=1dAEzbK1rOm8UGm_-CLdDEgeopFDcAtQP&export=download&confirm=t"
fi
# the file name is the first 12 hex digits of its SHA-256
[[ $(shasum -a 256 $NNUE | cut -c1-12) == 9991472750de ]] || { echo "NNUE checksum mismatch"; exit 1; }
echo "engine files ready"
