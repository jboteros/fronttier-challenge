#!/usr/bin/env bash
# Decides whether the transfer limit (E506) is per operation or cumulative, then finds the exact bound.
# Goes through bb.sh (logged, budgeted). About 90 to 120 requests. Run with BLACKBOX_URL and FRONTIER_BLACKBOX set.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
export BB_SEQ=${BB_SEQ:-limit}
H="transfer limit probe"

chk() { python3 -I -c '
import sys
n="".join(c if c.isdigit() else str(ord(c)-64) for c in sys.argv[1].upper() if c.isdigit() or "A"<=c<="Z")
print((1-100*int(n or "0"))%97)' "$1"; }

msg() { "$here/bb.sh" "$H: $1" POST /msg "{\"m\":\"$1;$(chk "$1")\"}"; }
setup() {
  "$here/bb.sh" "$H: reset" POST /__reset >/dev/null
  msg "ALTA;A" >/dev/null; msg "ALTA;B" >/dev/null; msg "DEPOSITO;AC-0001;9000000" >/dev/null
}
limited() { grep -q '"E506"' <<<"$1"; }

echo "1) cumulative or per operation? two transfers of 100000 in one sequence"
setup; msg "TRANSFER;AC-0001;AC-0002;100000" >/dev/null
second=$(msg "TRANSFER;AC-0001;AC-0002;100000")
if limited "$second"; then mode=cumulative; else mode=per-operation; fi
echo "   second transfer: $(tail -1 <<<"$second")  => $mode"

if [ "$mode" = per-operation ]; then
  lo=100000; hi=120000
  while (( hi - lo > 1 )); do
    mid=$(( (lo + hi) / 2 )); setup
    if limited "$(msg "TRANSFER;AC-0001;AC-0002;$mid")"; then hi=$mid; else lo=$mid; fi
  done
  echo "2) per-operation: accepted up to $lo, rejected from $hi"
else
  lo=100000; hi=160000   # cumulative total accepted / rejected
  while (( hi - lo > 1 )); do
    mid=$(( (lo + hi) / 2 )); setup
    msg "TRANSFER;AC-0001;AC-0002;100000" >/dev/null
    if limited "$(msg "TRANSFER;AC-0001;AC-0002;$(( mid - 100000 ))")"; then hi=$mid; else lo=$mid; fi
  done
  echo "2) cumulative: total accepted up to $lo, rejected from $hi (counted from the last reset)"
fi
"$here/bb.sh" "$H: leave the original clean" POST /__reset >/dev/null
