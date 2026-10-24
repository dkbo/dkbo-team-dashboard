#!/bin/bash
# usage: bash build.sh [p-files...]  → ../office.pen + ../*.webp
cd "$(dirname "$0")"
FILES=${@:-p*.js}
out=$(mktemp --suffix=.js)
: > $out; for f in p0-tokens.js $FILES; do [ "$f" = p0-tokens.js ] && [ -s $out ] && continue; cat $f >> $out; printf '\n//---\n' >> $out; done
cat >> $out <<'X'
Get((n,c)=>{c.skipChildren();if(/^(page|office)-/.test(n.name))Export([n.id],"webp","EXPORTDIR/.exports/"+n.name,{scale:1,quality:90});})
Print("exported")
X
sed -i "s#EXPORTDIR#$(cd ..; pwd)#" $out
node run.mjs $out - ../office.pen ../.exports/office.png
cd ..; for d in .exports/*/; do n=$(basename "$d"); f=$(ls "$d"*.webp 2>/dev/null | head -1); [ -n "$f" ] && mv "$f" "./$n.webp" && rmdir "$d"; done; ls *.webp
