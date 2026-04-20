---
name: pr-summarizer
description: Summarizes GitHub pull requests into a changelog-friendly bullet list. Use when the user asks to summarize a PR, generate release notes, or describe diffs.
license: Apache-2.0
compatibility: Requires git and gh CLI
metadata:
  author: my-org
  version: "0.1.0"
---

# PR Summarizer

## When to use
Activate when the user mentions "summarize PR", "release notes", or pastes a PR URL.

## Steps
1. Fetch the PR with `gh pr view <number> --json title,body,files`.
2. Group changes by directory.
3. Produce 3–7 bullets in the imperative mood.

## Examples
Input: PR #42 touching `src/auth/`
Output:
- Add OAuth refresh-token rotation
- ...

See [references/STYLE.md](references/STYLE.md) for tone guidance.


<!-- Use the conventional folders the spec recognizes: scripts/ for executable helpers (Python, Bash, JS), references/ for deeper docs the agent loads on demand, and assets/ for templates or data files. Reference them with relative paths like scripts/extract.py from inside SKILL.md. -->