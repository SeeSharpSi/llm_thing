#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
TMP_ROOT=${TMPDIR:-/tmp}
OUTPUT_DIR=$(mktemp -d "$TMP_ROOT/llm_thing_c_tests.XXXXXX")
CC=${CC:-cc}

cleanup() {
  rm -rf "$OUTPUT_DIR"
}
trap cleanup EXIT INT TERM

"$CC" \
  -std=c99 \
  -Wall \
  -Wextra \
  -Werror \
  -pedantic \
  -fsanitize=undefined \
  -I"$ROOT/src/c" \
  "$ROOT/src/c/llm_core.c" \
  "$ROOT/tests/c/llm_core_test.c" \
  -o "$OUTPUT_DIR/llm_core_test"

"$OUTPUT_DIR/llm_core_test"
