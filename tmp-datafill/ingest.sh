#!/bin/bash
# usage: ./ingest.sh SYMBOL [jobs...] — default: all fundamentals analysis
export PATH=/opt/homebrew/bin:/usr/local/bin:$PATH
cd /Users/kuntal/Developer/stock-buddy-skill-mcp/stock-buddy || exit 1
SYM=$1; shift
JOBS=${@:-"all fundamentals analysis"}
for J in $JOBS; do
  if [ "$J" = "all" ]; then
    npm run ingest -- --ticker "$SYM" --job all --days 365 2>&1 | tail -2
  else
    npm run ingest -- --ticker "$SYM" --job "$J" 2>&1 | tail -2
  fi
done
