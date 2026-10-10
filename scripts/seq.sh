#!/usr/bin/env bash
# Runs one sequence against the original: reset, then every payload with its check value computed (through bb.sh).
#   scripts/seq.sh "hypothesis" "ALTA;A" "ALTA;B" "DEPOSITO;AC-0001;100000"
# A payload ending in "|raw" is sent untouched (full message, check included): "ALTA;A;99|raw".
# NO_RESET=1 skips the initial reset.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
hyp=${1:?hypothesis required}; shift
chk() { python3 -I -c '
import sys
n="".join(c if c.isdigit() else str(ord(c)-64) for c in sys.argv[1].upper() if c.isdigit() or "A"<=c<="Z")
print((1-100*int(n or "0"))%97)' "$1"; }
[ -z "${NO_RESET:-}" ] && "$here/bb.sh" "$hyp: reset" POST /__reset >/dev/null
for p in "$@"; do
  if [[ $p == *"|raw" ]]; then m=${p%|raw}; else m="$p;$(chk "$p")"; fi
  out=$("$here/bb.sh" "$hyp: $p" POST /msg "{\"m\":\"$m\"}") || { echo "gateway stopped" >&2; exit 2; }
  printf '%-45s -> %s\n' "$m" "$(head -1 <<<"$out" | awk '{print $2}') $(tail -n +2 <<<"$out")"
done
