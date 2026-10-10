#!/usr/bin/env bash
# Replays recorded sequences and compares status + body the way the judge does (JSON keys unordered, strings exact).
#
#   scripts/smoke.sh [--original] [corpus.jsonl ...]     default corpus: tests/corpus/*.jsonl
#
# Replacement (default): REPLACEMENT_URL and TEAM_TOKEN. Each sequence starts with POST /__reset.
# --original: goes through scripts/bb.sh so every request is logged and counted against the budget.
# Corpus line: {"seq","n","request","status","response"} plus optional "method" and "path" (default POST /msg).
set -uo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
mode=replacement; [ "${1:-}" = "--original" ] && { mode=original; shift; }
files=("$@"); [ ${#files[@]} -eq 0 ] && files=("$root"/tests/corpus/*.jsonl)
[ "$mode" = replacement ] && : "${REPLACEMENT_URL:?set REPLACEMENT_URL}" "${TEAM_TOKEN:?set TEAM_TOKEN}"

canon() { # stdin: raw body -> canonical JSON (sorted keys) or JSON string when not JSON
  local s; s=$(cat)
  jq -S -c . <<<"$s" 2>/dev/null || printf '%s' "$s" | jq -Rs .
}

send() { # method path body label -> sets $status and $actual
  local method=$1 path=$2 body=$3 label=$4 raw
  if [ "$mode" = original ]; then
    raw=$(BB_SEQ="$seq" "$root/scripts/bb.sh" "$label" "$method" "$path" "$body") || { status=0; actual="gateway-error"; return; }
    status=$(head -1 <<<"$raw" | awk '{print $2}'); actual=$(tail -n +2 <<<"$raw" | jq -S -c .)
  else
    local args=(-sS -m 6 -X "$method" -H "Authorization: Bearer $TEAM_TOKEN" -w '\n%{http_code}')
    [ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data-raw "$body")
    raw=$(curl "${args[@]}" "$REPLACEMENT_URL$path") || { status=0; actual="curl-error"; return; }
    status=$(tail -1 <<<"$raw"); actual=$(sed '$d' <<<"$raw" | canon)
  fi
}

pass=0; fail=0
for f in "${files[@]}"; do
  for seq in $(jq -r .seq "$f" | awk '!seen[$0]++'); do
    send POST /__reset "" "smoke: reset before $(basename "$f") $seq"
    while IFS= read -r line; do
      n=$(jq -r '.n // .id' <<<"$line")
      method=$(jq -r '.method // "POST"' <<<"$line"); path=$(jq -r '.path // "/msg"' <<<"$line")
      body=$(jq -r 'if .request==null then "" elif (.request|type)=="string" then .request else (.request|tojson) end' <<<"$line")
      want_status=$(jq -r .status <<<"$line"); want=$(jq -S -c .response <<<"$line")
      send "$method" "$path" "$body" "smoke: replay $(basename "$f") $seq#$n"
      if [ "$status" = "$want_status" ] && [ "$actual" = "$want" ]; then pass=$((pass + 1)); echo "PASS $seq#$n"
      else fail=$((fail + 1)); echo "FAIL $seq#$n  $method $path $body"; echo "  want $want_status $want"; echo "  got  $status $actual"; fi
    done < <(jq -c --arg s "$seq" 'select(.seq==$s)' "$f")
  done
done
echo "pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
