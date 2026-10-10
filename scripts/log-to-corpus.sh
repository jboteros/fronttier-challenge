#!/usr/bin/env bash
# Turns the experiment log into replayable sequences: one sequence per segment between resets, team-token lines only.
# Invalid-check probes (E202) are dropped: they change no state and are expensive to replay.
#   scripts/log-to-corpus.sh [lab/experimentos.jsonl] [min_id] > tests/corpus/recorded.jsonl
set -euo pipefail
log=${1:-$(cd "$(dirname "$0")/.." && pwd)/lab/experimentos.jsonl}; min=${2:-0}
jq -c -s --argjson min "$min" '
  reduce .[] as $l ({seg: 0, out: []};
    if $l.auth != "team-token" or $l.id <= $min then .
    elif $l.path == "/__reset" then .seg += 1
    elif .seg == 0 then .
    elif ($l.response | type) == "object" and ($l.response.error? == "E202") then .
    else .out += [{seq: ("log-" + (.seg | tostring)), n: $l.id, method: $l.method, path: $l.path,
                   request: $l.request, status: $l.status, response: $l.response}]
    end)
  | .out[]' "$log"
