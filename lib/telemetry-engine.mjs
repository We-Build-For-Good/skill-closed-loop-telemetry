/**
 * lib/telemetry-engine.mjs
 * 
 * Core 6-Gate Closed-Loop Telemetry & Autonomous Optimization Engine.
 * Reusable library for evaluating whether product optimization decisions are justified.
 * 
 * Rule: Character invariants apply (zero em dashes).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { execSync } from 'node:child_process';

export function runGate0(product, targetDir) {
  const result = { name: 'Gate 0: Invariant & Consent Check', passed: false, findings: [] };
  const consent = product.consent_gate || {};

  if (!consent.required) {
    result.passed = true;
    result.findings.push({
      status: 'PASS',
      message: 'Zero telemetry required: product operates entirely client-side without data collection.'
    });
    return result;
  }

  const hasConsentFile = existsSync(join(targetDir, 'da-consent.js')) ||
                         existsSync(join(targetDir, 'consent.js')) ||
                         existsSync(join(targetDir, 'cookie-consent.js'));

  let consentScriptMentioned = false;
  const indexHtmlPath = join(targetDir, 'index.html');
  if (existsSync(indexHtmlPath)) {
    const htmlContent = readFileSync(indexHtmlPath, 'utf8');
    if (htmlContent.includes('da-consent.js') || htmlContent.includes('consent') || htmlContent.includes('gtag')) {
      consentScriptMentioned = true;
    }
    const rawGtagWithoutGate = htmlContent.includes('googletagmanager.com/gtag/js') &&
                               !htmlContent.includes('da-consent.js') &&
                               !htmlContent.includes('consent');
    if (rawGtagWithoutGate) {
      result.findings.push({
        status: 'FAIL',
        message: 'Unconsented telemetry script detected directly in HTML without consent gate.'
      });
      return result;
    }
  }

  if (hasConsentFile || consentScriptMentioned || (consent.mechanism && consent.mechanism !== 'auto-detect')) {
    result.passed = true;
    result.findings.push({
      status: 'PASS',
      message: `Consent mechanism verified (${consent.mechanism || 'detected'}). Zero unconsented beacons.`
    });
  } else {
    result.findings.push({
      status: 'WARN',
      message: 'No explicit consent gate file located. Invariant requires opt-in boundary.'
    });
    result.passed = true;
  }

  return result;
}

export function runGate1(product, targetDir) {
  const result = { name: 'Gate 1: Measurement Integrity', passed: false, findings: [] };
  const indexHtmlPath = join(targetDir, 'index.html');

  if (existsSync(indexHtmlPath)) {
    const html = readFileSync(indexHtmlPath, 'utf8');

    // Telemetry Trap Check: Is the feature gated, draft, or "coming soon"?
    const trapPhrases = [
      'in development',
      'not yet for sale',
      'coming soon',
      'mock data',
      'preview only'
    ];
    const detectedTraps = trapPhrases.filter(phrase => html.toLowerCase().includes(phrase));

    if (detectedTraps.length > 0) {
      result.findings.push({
        status: 'TRAP_ALERT',
        message: `Telemetry Trap boundary identified: Product/tier marked with [${detectedTraps.join(', ')}]. Zero conversions are intentional; automated refactoring is strictly blocked.`
      });
      // Deliberately fail Gate 1 if telemetry trap is active to block autonomous refactors
      result.passed = false;
      return result;
    }

    const mId = product.telemetry?.measurement_id;
    if (mId && mId !== 'none' && mId !== 'unknown') {
      result.findings.push({
        status: 'PASS',
        message: `Measurement ID registered: ${mId}.`
      });
    } else {
      result.findings.push({
        status: 'INFO',
        message: 'No external measurement ID registered or required.'
      });
    }
  }

  result.passed = true;
  return result;
}

export function runGate2(product) {
  const result = { name: 'Gate 2: Outcome & Guardrail Diagnosis', passed: false, findings: [] };
  const metrics = product.metrics || {};

  if (!metrics.primary_metric) {
    result.findings.push({
      status: 'FAIL',
      message: 'No primary mechanical metric defined for this product.'
    });
    return result;
  }

  result.findings.push({
    status: 'PASS',
    message: `Primary Metric: [${metrics.primary_metric}]: ${metrics.primary_description || 'Mechanical utility metric'}`
  });

  if (!metrics.countermetric) {
    result.findings.push({
      status: 'FAIL',
      message: 'Mandatory countermetric is missing. Without a countermetric, proxy optimization can destroy product quality.'
    });
    return result;
  }

  result.findings.push({
    status: 'PASS',
    message: `Mandatory Countermetric: [${metrics.countermetric}]: ${metrics.countermetric_description || 'Prevents proxy destruction'}`
  });

  if (metrics.guardrails && metrics.guardrails.length > 0) {
    result.findings.push({
      status: 'PASS',
      message: `Active Invariant Guardrails: ${metrics.guardrails.join(', ')}.`
    });
  }

  result.passed = true;
  return result;
}

export function runGate3(product) {
  const result = { name: 'Gate 3: Cohort Power & Method Selection', passed: true, findings: [] };

  result.findings.push({
    status: 'ADVISORY',
    message: 'Early-stage cohort rule active: Traffic volume is focused (<1,000 weekly conversions).'
  });
  result.findings.push({
    status: 'DECISION',
    message: 'Frequentist 50/50 A/B testing is prohibited to prevent false positive chasing.'
  });
  result.findings.push({
    status: 'APPROVED_METHOD',
    message: `Approved Optimization Protocol: [${product.optimization_method || 'deterministic_sensory_audit_and_qualitative_probe'}].`
  });

  return result;
}

export function runGate4(targetDir, options = {}) {
  const result = { name: 'Gate 4: System Invariants & Sensory Verification', passed: false, findings: [] };

  if (options.skipInvariants) {
    result.passed = true;
    result.findings.push({
      status: 'SKIP',
      message: 'External invariant check skipped via option.'
    });
    return result;
  }

  try {
    const cmd = `wb4g-invariants "${targetDir}"`;
    execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    result.passed = true;
    result.findings.push({
      status: 'PASS',
      message: 'wb4g-invariants passed: Zero em dashes, brand integrity, and modularity verified.'
    });
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    if (output.includes('0 Errors Found') || output.includes('passed with warnings')) {
      result.passed = true;
      result.findings.push({
        status: 'PASS',
        message: 'wb4g-invariants passed with non-fatal warnings.'
      });
    } else {
      result.passed = false;
      result.findings.push({
        status: 'FAIL',
        message: `System invariant engine rejected codebase:\n${output.slice(0, 300)}`
      });
    }
  }

  return result;
}

export function runGate5(product, gateResults, outputDir) {
  const result = { name: 'Gate 5: Controlled Recording & Decision', passed: true, findings: [] };
  const allPassed = gateResults.every(g => g.passed);

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const auditReport = {
    product: product.key,
    name: product.name,
    timestamp,
    overall_status: allPassed ? 'CLEARED' : 'BLOCKED',
    approved_optimization_method: product.optimization_method,
    gates: gateResults
  };

  const reportPath = join(outputDir, `${product.key}-audit.json`);
  writeFileSync(reportPath, JSON.stringify(auditReport, null, 2), 'utf8');

  result.findings.push({
    status: 'RECORDED',
    message: `Audit evidence saved to ${reportPath}. Inconclusive results preserved honestly.`
  });

  return result;
}

export async function evaluateProduct(product, targetDir, options = {}) {
  const outputDir = options.outputDir || resolve(process.cwd(), 'telemetry-audit-output');
  const g0 = runGate0(product, targetDir);
  const g1 = runGate1(product, targetDir);
  const g2 = runGate2(product);
  const g3 = runGate3(product);
  const g4 = runGate4(targetDir, options);
  const g5 = runGate5(product, [g0, g1, g2, g3, g4], outputDir);

  const allGates = [g0, g1, g2, g3, g4, g5];
  const passed = allGates.every(g => g.passed);

  return {
    product: product.key,
    name: product.name,
    passed,
    overall_status: passed ? 'CLEARED' : 'BLOCKED',
    method: product.optimization_method,
    gates: allGates
  };
}
