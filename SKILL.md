---
name: closed-loop-telemetry
description: Decision gate to run before an agent changes a product because of analytics data. Checks consent, that the measurement ID is really in the code, that a primary metric has a countermetric, whether traffic supports A/B testing, and the repo's code invariants. Use before proposing or making analytics-driven product changes.
license: MIT
metadata:
  author: We Build for Good
  version: "2.0.0"
---

# Closed-Loop Telemetry: check before you optimise

A popular agent playbook says: give an agent your analytics, let it pick a number, and A/B test a change on half your users every day. On small products this goes wrong in four ways:

1. **Too little traffic.** With 50 to 500 users a week, a 50/50 split mostly measures noise.
2. **The telemetry trap.** Zero conversions might mean the product is broken, the tag is missing, or the page says "not yet for sale" on purpose. An agent cannot tell which.
3. **Proxy metrics.** Optimise puzzle completion alone and the agent makes puzzles trivial.
4. **Consent erosion.** An optimising agent adds a tracker or session replay without asking users.

This skill runs six gates and returns CLEARED, CLEARED_WITH_GAPS or BLOCKED.

## The gates

All checks are static: they read files in the repo. They do not load the page or watch network traffic.

| Gate | What it actually checks |
| :--- | :--- |
| 0 Consent | If the registry says consent is required: no HTML file loads a known tracker (Google tag, GA, Plausible, Hotjar, Clarity, Segment, PostHog, Meta pixel) directly, unless Google Consent Mode defaults to denied or the script is held back with `type="text/plain"`; and a consent file exists (`consent_gate.file`, or `consent.js`, `cookie-consent.js` and similar). If the registry says no consent is needed, it fails if a tracker is loaded anyway. |
| 1 Measurement and trap | Blocks if any HTML file contains "in development", "not yet for sale", "coming soon", "mock data" or "preview only". If a `measurement_id` is registered, it must appear in a source or `.env` file. |
| 2 Metrics | The registry must name a `primary_metric` and a `countermetric`. Guardrails are listed but not checked. |
| 3 Method | Uses `metrics.weekly_conversions` if you supply it. Under 1,000 a week (or no figure), it says not to A/B test and names your `optimization_method`. Advisory only; never blocks. |
| 4 Invariants | Runs `wb4g-invariants --dir <repo>` (from skill-system-invariant-engine, found side by side or on PATH). Violations, a config error or a missing tool all block. |
| 5 Recording | Writes the full decision to `<output-dir>/<product>-audit.json`. Blocks if it cannot write. |

A check that could not run (no HTML files, `--skip-invariants`, `verify_in_code: false`) is reported as `NOT_CHECKED` and the result is CLEARED_WITH_GAPS. Use `--strict` to make gaps block.

This skill does not run the visual audit. Run `wb4g-visual-audit` separately, or use skill-safe-deploy, which runs both.

## Usage

```bash
# Product whose registry "path" matches the current directory
wb4g-telemetry-gate

# Named product, explicit registry
wb4g-telemetry-gate --registry ./product-registry.json --product my-app

# JSON for agents; block on any gap
wb4g-telemetry-gate --product my-app --json --strict
```

The registry is found at `--registry`, then `./product-registry.json`, then `<dir>/product-registry.json`. Product paths are relative to the registry file. If no product matches, the gate stops with exit code 2. It never falls back to another product.

## Exit codes

* `0`: CLEARED or CLEARED_WITH_GAPS
* `1`: BLOCKED
* `2`: bad options, no registry, or no matching product

## What this skill does not do

* It does not prove your consent banner works in a browser, or that you comply with any law.
* It does not prove your metric reflects real value.
* It does not calculate statistical power; it applies a fixed threshold you can read in the code.
* It does not write code changes; it decides whether an agent should make them.
