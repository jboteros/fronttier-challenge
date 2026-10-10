#!/usr/bin/env bash
# Single gateway to the original black box: sends one request, prints it, and appends one line to experimentos.jsonl.
#
#   bb.sh "<hypothesis>" <METHOD> <path> [body]
#   bb.sh "PING ignores the check field" POST /msg '{"m":"PING;XX"}'
#
# Env: BLACKBOX_URL (required) · FRONTIER_BLACKBOX (personal token) · BB_SEQ (sequence id, default s0)
#      BB_NOAUTH=1 (send no Authorization header) · BB_AUTH="Bearer x" (override the header value)
#      BB_LOG (default lab/experimentos.jsonl) · BB_BUDGET (daily guard, default 7000)
set -uo pipefail

hyp=${1:?hypothesis required}; method=${2:?method required}; path=${3:?path required}; body=${4:-}
: "${BLACKBOX_URL:?set BLACKBOX_URL}"

root=$(cd "$(dirname "$0")/.." && pwd)
log=${BB_LOG:-$root/lab/experimentos.jsonl}
labdir=$(dirname "$log"); mkdir -p "$labdir"
counter="$labdir/budget-$(date +%F).count"
used=$(cat "$counter" 2>/dev/null || echo 0)
if (( used >= ${BB_BUDGET:-7000} )); then echo "budget guard: $used requests today" >&2; exit 2; fi

hdr=$(mktemp); out=$(mktemp); trap 'rm -f "$hdr" "$out"' EXIT
args=(-sS -m 10 -X "$method" -D "$hdr" -o "$out" -w '%{http_code}')
auth="none"
if [ -n "${BB_AUTH:-}" ]; then args+=(-H "Authorization: $BB_AUTH"); auth="custom"
elif [ -z "${BB_NOAUTH:-}" ]; then args+=(-H "Authorization: Bearer ${FRONTIER_BLACKBOX:?set FRONTIER_BLACKBOX}"); auth="team-token"; fi
[ -n "$body" ] && args+=(-H 'Content-Type: application/json' --data-raw "$body")

status=$(curl "${args[@]}" "$BLACKBOX_URL$path")
echo $((used + 1)) > "$counter"
sleep 0.12

x_req=$(grep -i '^x-req:' "$hdr" | tr -d '\r' | awk '{print $2}')
infra=$(grep -i '^x-frontier-infra:' "$hdr" | tr -d '\r' | awk '{print $2}')
if [ "$infra" = "rate-limit" ]; then echo "RATE LIMITED (infrastructure, not logged as behavior). Slow down." >&2; exit 3; fi

response=$(jq -c . "$out" 2>/dev/null || jq -Rs . "$out")
touch "$log"
id=$(( $(wc -l < "$log") + 1 ))
jq -nc --argjson id "$id" --arg seq "${BB_SEQ:-s0}" --arg x "$x_req" --arg h "$hyp" \
  --arg m "$method" --arg p "$path" --arg a "$auth" --arg b "$body" \
  --argjson s "${status:-0}" --argjson r "$response" \
  '{id:$id, seq:$seq, x_req:($x|tonumber? // $x), hipotesis:$h, method:$m, path:$p, auth:$a,
    request:(if $b=="" then null else ($b|fromjson? // $b) end), status:$s, response:$r, conclusion:""}' >> "$log"

echo "HTTP $status  x-req=${x_req:-?}  log#$id  budget=$((used + 1))"
echo "$response"
