#!/bin/bash
set -Eeuo pipefail
exec node "$(dirname "$0")/setup-ocr.mjs"
