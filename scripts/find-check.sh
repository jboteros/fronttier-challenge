#!/usr/bin/env bash
# Finds the valid check value for one payload by trying 0..MAX against the original (through bb.sh, so logged and budgeted).
#   scripts/find-check.sh "ALTA;A" [max=99]            COMMAND;args without the check field
# Prints "<payload> -> <check>" on success. Costs up to max+1 requests; ALTA creates accounts, reset afterwards.
set -uo pipefail
payload=${1:?payload required, e.g. ALTA;A}; max=${2:-99}
here=$(cd "$(dirname "$0")" && pwd)
for c in $(seq 0 "$max"); do
  out=$("$here/bb.sh" "find valid check for $payload (E202 until correct)" POST /msg "{\"m\":\"$payload;$c\"}") || { echo "gateway stopped at $c" >&2; exit 2; }
  if ! grep -q '"E202"' <<<"$out"; then echo "$payload -> $c"; tail -n +2 <<<"$out"; exit 0; fi
done
echo "$payload -> no valid check in 0..$max" >&2; exit 1
