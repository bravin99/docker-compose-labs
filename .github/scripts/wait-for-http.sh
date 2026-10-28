#!/usr/bin/env bash
# Usage: wait-for-http.sh <url> [attempts]
# Polls <url> every 2 seconds until it answers with a 2xx or 3xx status.
set -uo pipefail

url="$1"
attempts="${2:-30}"
code="none"

for _ in $(seq 1 "$attempts"); do
  code=$(curl -s -o /dev/null -w '%{http_code}' "$url") || code="000"
  if [[ "$code" =~ ^[23] ]]; then
    echo "OK: $url answered $code"
    exit 0
  fi
  sleep 2
done

echo "FAIL: $url did not answer with 2xx/3xx (last status: $code)"
exit 1
