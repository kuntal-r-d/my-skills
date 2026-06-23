#!/usr/bin/env bash
# Push the Stock Buddy skill suite to github.com/kuntal-r-d/my-skills
# Run this on your Mac (where your git/GitHub credentials live).
set -euo pipefail

REPO="https://github.com/kuntal-r-d/my-skills.git"
SKILLS_SRC="/Users/kuntal/Developer/stock-buddy-skill-mcp/stock-buddy/skills"
BRANCH="add-stock-buddy-skills"
WORKDIR="$(mktemp -d)"

echo "==> Cloning $REPO (main)"
git clone -b main "$REPO" "$WORKDIR/my-skills"
cd "$WORKDIR/my-skills"

echo "==> Creating branch $BRANCH"
git checkout -b "$BRANCH"

echo "==> Copying skills (merges into existing skills/, keeps pr-summarizer)"
mkdir -p skills
# trailing /. copies contents incl. README.md and .gitignore; __pycache__ is git-ignored
cp -R "$SKILLS_SRC/." skills/

git add skills
echo "==> Files staged:"
git status -s

git commit -m "Add Stock Buddy DSE analysis skill suite (14 agent skills)

Adds 14 Agent Skills for Dhaka Stock Exchange analysis (investment + momentum),
each with SKILL.md + TypeScript CLI scripts + references. Derived from
PRD-001/prd-002. Skills: technical-analysis, momentum-screen, fundamental-analysis,
value-investment-checklist, smart-money-flow, sentiment-news, macro-regime,
signal-synthesizer, risk-manager, stock-screener, pattern-miner, daily-briefing,
ticker-dossier, financial-terms-educator."

echo "==> Pushing to origin/$BRANCH"
git push -u origin "$BRANCH"

if command -v gh >/dev/null 2>&1; then
  echo "==> Opening PR"
  gh pr create --base main --head "$BRANCH" --fill
else
  echo "==> gh CLI not found. Open a PR here:"
  echo "    https://github.com/kuntal-r-d/my-skills/compare/main...$BRANCH?expand=1"
fi

echo "==> Done. Temp clone at: $WORKDIR/my-skills"
