# Closed-Loop Telemetry: Autonomous Optimization Gate

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Protocol: Open Agent Skills](https://img.shields.io/badge/Protocol-Open%20Agent%20Skills-purple.svg)](https://github.com/We-Build-For-Good)
[![Tests: Passing](https://img.shields.io/badge/Tests-8%2F8%20Passing-brightgreen.svg)](test/telemetry-gate.test.mjs)

> **A deterministic decision gate for evidence-driven product optimization.**  
> Built and battle-tested by [We Build for Good](https://webuildforgood.com).

`skill-closed-loop-telemetry` helps AI agents and engineering teams establish whether a product optimization is justified before acting on analytics or user-behavior data. It evaluates six configured gates covering user consent, measurement integrity, outcome metrics, experiment suitability, engineering invariants, and controlled recording.

---

## Why This Exists

Trending playbooks often tell teams: *"Pipe telemetry to an AI agent, have it come up with a change daily, and test it against half your users."*

In real-world products, that advice causes four severe failures:
1. **The Sample Size Fallacy**: Splitting early cohorts of 50 to 500 users produces zero statistical power. Daily testing guarantees chasing random noise.
2. **The Telemetry Trap**: An agent seeing 0 conversions cannot tell if the app is broken or if the tier is intentionally marked *"In development: not yet for sale"*.
3. **Proxy Metric Destruction**: An agent tasked with maximizing puzzle completion will make puzzles trivial, driving up completion while destroying user retention.
4. **Consent Erosion**: Optimizing agents silently enable trackers or session replays, violating privacy boundaries.

---

## The 6-Gate Architecture

| Gate | Name | Responsibility |
| :--- | :--- | :--- |
| **0** | **Invariant & Consent Check** | Verifies explicit user opt-in before tracking. Blocks unconsented beacons. |
| **1** | **Measurement Integrity** | Checks tag health and blocks refactoring on pre-launch or gated features. |
| **2** | **Outcome & Guardrail Diagnosis** | Enforces 1 primary mechanical metric paired with a mandatory countermetric. |
| **3** | **Cohort Power & Method Selection** | Prohibits underpowered 50/50 A/B testing; selects deterministic audits for low traffic. |
| **4** | **System Invariants & Sensory Audit** | Enforces character invariants (zero em dashes) and multi-viewport visual checks. |
| **5** | **Controlled Recording & Decision** | Logs auditable JSON decisions. Preserves inconclusive results honestly. |

---

## Quick Start

### Installation

Clone and install into your agent workspace:

```bash
git clone https://github.com/We-Build-For-Good/skill-closed-loop-telemetry.git
cd skill-closed-loop-telemetry
npm test
```

### Run the Gate

```bash
# Evaluate a product using the example registry
node bin/telemetry-gate.mjs --product sample-utility

# Provide your own registry
node bin/telemetry-gate.mjs --registry ./my-registry.json --product my-app

# Output raw JSON for agent ingestion
node bin/telemetry-gate.mjs --product sample-utility --json
```

---

## Example Registry (`product-registry.json`)

```json
{
  "products": {
    "my-app": {
      "name": "My App",
      "path": ".",
      "consent_gate": {
        "required": true,
        "mechanism": "cookie-banner"
      },
      "telemetry": {
        "provider": "OpenTelemetry",
        "measurement_id": "otel-service-01"
      },
      "metrics": {
        "primary_metric": "onboarding_completion_rate",
        "countermetric": "user_frustration_bounce",
        "guardrails": ["zero_em_dashes", "offline_first"]
      },
      "optimization_method": "deterministic_sensory_audit_and_qualitative_probe"
    }
  }
}
```

---

## Exit Codes

* `0`: **CLEARED** (All 6 gates passed; optimization method approved).
* `1`: **BLOCKED** (One or more gates failed; remediation required).

---

## The Trio of Executable Engines

This skill completes the We Build For Good open-source governance suite:
1. [`skill-closed-loop-telemetry`](https://github.com/We-Build-For-Good/skill-closed-loop-telemetry): Are we permitted and informed to act on this data?
2. [`skill-system-invariant-engine`](https://github.com/We-Build-For-Good/skill-system-invariant-engine): Does the code violate any invariant or rule?
3. [`skill-visual-sensory-audit`](https://github.com/We-Build-For-Good/skill-visual-sensory-audit): Does the rendered interface exhibit defects at 320px to 1440px?

---

## License

MIT (c) 2026 We Build for Good.
