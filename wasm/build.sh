#!/usr/bin/env bash
# build.sh — собирает Go-UDF в wasm + кладёт wasm_exec.js в /public

set -e

# Параметры
SRC_DIR="$(dirname "$0")"          # каталог /wasm
OUT_WASM="../public/udf.wasm"      # куда кладём wasm
OUT_JS="../public/wasm_exec.js"    # runtime JS для браузера

echo "▶️  Компиляция TinyGo → wasm"
tinygo build -target wasm -opt=2 -o "$OUT_WASM" "$SRC_DIR/udf.go"

echo "▶️  Копирование wasm_exec.js"
cp "$(tinygo env TINYGOROOT)/targets/wasm_exec.js" "$OUT_JS"

echo "✅ Готово: $(basename "$OUT_WASM") и wasm_exec.js находятся в /public"
