---
name: closed-loop-telemetry
description: Deterministic decision gate for evidence-driven product optimization. Connects user consent, measurement integrity, outcome metrics, and engineering invariants before code changes. Use before proposing or implementing telemetry-driven product optimizations.
license: MIT
metadata:
  author: We Build for Good
  version: "1.0.0"
---

# Closed-Loop Telemetry: Evidence-Driven Product Optimization

Many modern AI growth playbooks suggest an appealing loop: instruct an agent to inspect analytics, pick a number, and run daily 50/50 A/B tests against users to compound growth.

In real-world studios and early-stage products, naive automation causes four fatal failures:
1. **The Sample Size Fallacy**: Splitting modest cohorts (50 to 500 weekly users) produces zero statistical power. Testing daily guarantees chasing random noise.
2. **The Telemetry Trap**: An agent observing zero conversions cannot tell whether the product is broken, the measurement tag failed, or the product is intentionally marked "In development: not yet for sale".
3. **Proxy Metric Destruction**: An agent tasked with optimizing puzzle completion rates will make puzzles trivial, driving up the primary metric while destroying user retention.
4. **Consent Erosion**: Optimizing agents silently enable tracking, session replays, or invasive beacons, violating user dignity and legal privacy boundaries.

The **Closed-Loop Telemetry Engine** establishes an executable 6-gate decision protocol that determines whether an AI agent has valid evidence, verified permission, and sufficient statistical justification before any code change is tested or deployed.

---

## The 6-Gate Protocol

```
[Gate 0: Invariant & Consent Check]
       │
       ▼
[Gate 1: Measurement Integrity & Telemetry Trap Check]
       │
       ▼
[Gate 2: Outcome & Guardrail Diagnosis]
       │
       ▼
[Gate 3: Cohort Power & Method Selection]
       │
       ▼
[Gate 4: System Invariants & Sensory Verification]
       │
       ▼
[Gate 5: Controlled Recording & Decision]
```

### Gate 0: Invariant & Consent Check
* **Requirement:** Explicit user consent must be verified before any analytics, telemetry, or session replay loads.
* **Invariant:** No session replay of sensitive fields, credentials, or personal notes.
* **Behavior:** Missing consent mechanisms or unconsented beacons immediately produce `BLOCKED`.

### Gate 1: Measurement Integrity & Telemetry Trap Check
* **Requirement:** Measurement IDs and event listeners must be active and syntactically valid.
* **Telemetry Trap Guard:** Scans for markers such as "in development", "coming soon", or "not yet for sale". If detected, zero conversions are recognized as intentional, and autonomous refactoring is blocked.

### Gate 2: Outcome & Guardrail Diagnosis
* **Requirement:** The product must declare exactly 1 primary mechanical metric (e.g. on-time departure confirmation, sprint completion with accuracy).
* **Mandatory Countermetric:** Every primary metric must be paired with a countermetric (e.g. frustration bounce, snooze panic) to prevent proxy degradation.

### Gate 3: Cohort Power & Method Selection
* **Requirement:** Statistical power check based on cohort size.
* **Policy:** For cohorts under 1,000 conversions per week, frequentist 50/50 A/B testing is prohibited. The engine directs the agent to deterministic quality audits (`skill-visual-sensory-audit`) or qualitative user probes.

### Gate 4: System Invariants & Sensory Verification
* **Requirement:** Proposed changes must pass code invariants (`wb4g-invariants`: zero em dashes, modular boundaries) and multi-viewport sensory verification (`wb4g-visual-audit`: 375px, 768px, 1440px).

### Gate 5: Controlled Recording & Decision
* **Requirement:** Complete audit decisions are logged to JSON disk state.
* **Honesty Policy:** Inconclusive results must be explicitly logged as inconclusive. Never manufacture statistical winners from sparse data.

---

## CLI Usage

```bash
# Evaluate a product registered in product-registry.json
wb4g-telemetry-gate --product sample-utility

# Pass a custom registry file
wb4g-telemetry-gate --registry ./my-registry.json --product my-app

# Output raw JSON for agent ingestion
wb4g-telemetry-gate --product sample-utility --json

# Run on current working directory
wb4g-telemetry-gate .
```

---

## Exit Codes

* `0`: **CLEARED** (All 6 gates passed; optimization method approved).
* `1`: **BLOCKED** (One or more gates failed; remediation required before code changes).

---

## What This Skill Does Not Do

* It does not guarantee legal compliance under all jurisdictions.
* It does not guarantee that a chosen metric represents genuine business value.
* It does not automatically author code refactors; it gates whether refactoring is permitted.
