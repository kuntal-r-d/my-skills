# Ticker Dossier — inputs, layout & PDF export

The Ticker Dossier (PRD-002 REQ-116) is the "one-click PDF" consolidator. To keep the
suite composable, it is a **pure renderer**: it does no analysis itself. The orchestrator
runs the component skills, then passes their Thinking Cards in under `cards`.

## Expected card inputs

`cards` is an object keyed by analysis type; each value is the **JSON output** of the
matching sibling skill.

| `cards` key | Produced by | Section |
|-------------|-------------|---------|
| `fundamental` | `fundamental-analysis` | Investment view |
| `value` | `value-investment-checklist` | Investment view |
| `technical` | `technical-analysis` | Momentum view |
| `momentum` | `momentum-screen` | Momentum view |
| `pattern` | `pattern-miner` | Momentum view |
| `risk` | `risk-manager` | Risk & levels |
| `smart_money` | `smart-money-flow` | Smart-money & sentiment |
| `sentiment` | `sentiment-news` | Smart-money & sentiment |
| `macro` | `macro-regime` | Macro context |
| `synthesizer` | `signal-synthesizer` | Synthesised signal |

All keys are optional. Any card may be omitted; the dossier lists what was present vs
missing in its provenance footer. An optional top-level `data` object may carry the raw
input the cards were derived from (not rendered, but preserved for traceability).

## Section layout

1. **Header** — ticker, `as_of`, and a disclaimer banner.
2. **At a glance** — a verdict table with one row per supplied card, reading `rating`
   (falls back to `grade`/`status`), `score` (falls back to `composite_score`/
   `dse_composite_score`), and `confidence`.
3. **Investment view** — fundamental + value cards.
4. **Momentum view** — technical + momentum + pattern cards.
5. **Risk & levels** — risk-manager card.
6. **Smart-money & sentiment** — smart_money + sentiment cards.
7. **Macro context** — macro card.
8. **Synthesised signal** — synthesizer card.
9. **Data provenance / missing analyses** — explicit included vs missing list.

Each card block prints its rating/score/confidence line, up to eight `reasoning` bullets,
and any `flags`. Unknown extra fields are ignored, so the dossier stays robust as sibling
skills evolve.

## Empty-cards skeleton

If `cards` is absent or empty the dossier still renders the header, an explanatory
"no analyses supplied" note in place of the verdict table, "No analyses supplied for this
section." under each heading, and a footer showing all ten cards missing. It never invents
numbers — a skeleton is preferable to fabricated confidence.

## Generating a PDF (not required at runtime)

The script only emits Markdown; conversion is an offline step so the skill keeps its
stdlib-only, no-network contract. Any Markdown→PDF tool works, e.g. Pandoc:

```bash
python3 scripts/dossier.py --input dossier_input.json \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['markdown'])" > GP_dossier.md
pandoc GP_dossier.md -o GP_dossier.pdf            # needs a LaTeX engine
# or, without LaTeX:
pandoc GP_dossier.md -o GP_dossier.pdf --pdf-engine=weasyprint
```

Other options: `md-to-pdf`, `wkhtmltopdf` (via an intermediate HTML), or pasting the
Markdown into any editor that exports PDF. None of these are invoked by the skill.
