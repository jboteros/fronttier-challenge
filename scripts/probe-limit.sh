#!/usr/bin/env bash
# Finds the transfer limit (E506) on the current service version, and whether it is per operation or cumulative.
# Bisects the largest accepted single transfer between LO (known accepted) and HI (known rejected), resetting each time.
# Then sends two transfers of that size: a second rejection means a cumulative limit. About 90 requests, logged and budgeted.
#   LO=40000 HI=100000 scripts/probe-limit.sh
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
export BB_SEQ=${BB_SEQ:-limit}
lo=${LO:-40000}; hi=${HI:-100000}

try() { # amount [times]: fresh state, N transfers of the amount; prints the status of the last one
  NO_RESET= "$here/seq.sh" "limit probe $1" "ALTA;A" "ALTA;B" "DEPOSITO;AC-0001;9000000" >/dev/null
  local last=""
  for _ in $(seq 1 "${2:-1}"); do
    last=$(NO_RESET=1 "$here/seq.sh" "limit probe $1" "TRANSFER;AC-0001;AC-0002;$1")
  done
  grep -q E506 <<<"$last" && echo rejected || echo accepted
}

while (( hi - lo > 1 )); do
  mid=$(( (lo + hi) / 2 ))
  if [ "$(try "$mid")" = rejected ]; then hi=$mid; else lo=$mid; fi
done
echo "single transfer: accepted up to $lo, rejected from $hi"
if [ "$(try "$lo" 2)" = rejected ]; then echo "two transfers of $lo: second rejected => cumulative limit"; else echo "two transfers of $lo: both accepted => per-operation limit"; fi
"$here/bb.sh" "limit probe: leave clean" POST /__reset >/dev/null
