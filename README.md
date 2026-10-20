# Closed-Loop Telemetry: check before you optimise

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A decision gate to run before an AI agent changes a product because of analytics data. It checks consent, measurement, metrics and code invariants, then returns CLEARED, CLEARED_WITH_GAPS or BLOCKED and writes the decision to a JSON file.

See [SKILL.md](SKILL.md) for exactly what each gate checks and what it does not.

## Why

On small products, "let an agent A/B test a change every day" mostly chases noise, misreads deliberately unlaunched features as failures, optimises a proxy metric at the cost of quality, and tempts the agent to add tracking without consent. Each gate targets one of those.

## Quick start

```bash
git clone https://github.com/We-Build-For-Good/skill-closed-loop-telemetry.git
cd skill-closed-loop-telemetry
npm test

# Try the two examples: one clears, one is blocked by the telemetry trap
node bin/telemetry-gate.mjs --registry examples/product-registry.json --product sample-utility
node bin/telemetry-gate.mjs --registry examples/product-registry.json --product sample-quiz

# In your project, with a product-registry.json next to it:
node /path/to/skill-closed-loop-telemetry/bin/telemetry-gate.mjs --product my-app
```

For Gate 4, clone [skill-system-invariant-engine](https://github.com/We-Build-For-Good/skill-system-invariant-engine) next to this repo or install `wb4g-invariants` on your PATH. Without it Gate 4 blocks, unless you pass `--skip-invariants` (reported as a gap).

## Registry (`product-registry.json`)

```json
{
  "products": {
    "my-app": {
      "name": "My App",
      "path": ".",
      "consent_gate": { "required": true, "file": "src/consent.js" },
      "telemetry": { "provider": "Google Analytics 4", "measurement_id": "G-XXXXXXX" },
      "metrics": {
        "primary_metric": "onboarding_completion_rate",
        "countermetric": "user_frustration_bounce",
        "weekly_conversions": 120,
        "guardrails": ["offline_first"]
      },
      "optimization_method": "deterministic_audit_and_qualitative_probe"
    }
  }
}
```

`path` is relative to the registry file. Set `"consent_gate": { "required": false }` for products that collect no analytics (the gate then checks that none is loaded). Set `"telemetry": { "verify_in_code": false }` if your measurement ID is injected at deploy time.

## Exit codes

* `0`: CLEARED or CLEARED_WITH_GAPS
* `1`: BLOCKED
* `2`: bad options, no registry, or no matching product

## Related

* [skill-system-invariant-engine](https://github.com/We-Build-For-Good/skill-system-invariant-engine): rule checks used by Gate 4.
* [skill-visual-sensory-audit](https://github.com/We-Build-For-Good/skill-visual-sensory-audit): rendered checks at phone, tablet and desktop widths (run separately).
* [skill-safe-deploy](https://github.com/We-Build-For-Good/skill-safe-deploy): runs the checks above as one release gate.

## License

MIT (c) 2026 We Build for Good.
