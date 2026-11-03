#!/bin/sh
# Quick lookups in index.html. Long lines (the terrain grid and parcel data run to 60k chars) are clipped.
#   tools/map.sh               outline: every section marker with its line number
#   tools/map.sh def NAME      where a function / const / let / class NAME is defined
#   tools/map.sh find PATTERN  regex search, lines clipped to 200 chars
#   tools/map.sh at LINE [N]   print N lines (default 40) from LINE, clipped
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
f="$root/index.html"
clip='--max-columns=200 --max-columns-preview'

case "${1:-outline}" in
  outline)
    rg -n $clip -e '^// -{3,} .* -{3,}' -e '^/\* ={3,} .* ={3,} \*/' -e '^<(script|style)\b' "$f" ;;
  def)
    [ -n "$2" ] || { echo "usage: map.sh def NAME" >&2; exit 2; }
    rg -n $clip -e "\b(function|const|let|var|class)\s+$2\b" -e "\b$2\s*[:=]\s*(function|\()" "$f" ;;
  find)
    [ -n "$2" ] || { echo "usage: map.sh find PATTERN" >&2; exit 2; }
    rg -n $clip -e "$2" "$f" ;;
  at)
    [ -n "$2" ] || { echo "usage: map.sh at LINE [N]" >&2; exit 2; }
    sed -n "$2,$(( $2 + ${3:-40} - 1 ))p" "$f" | cut -c1-300 ;;
  *)
    sed -n '2,6p' "$0" >&2; exit 2 ;;
esac
