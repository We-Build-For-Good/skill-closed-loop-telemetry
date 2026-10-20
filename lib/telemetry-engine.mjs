/**
 * lib/telemetry-engine.mjs
 *
 * Closed-loop telemetry decision gate. Six gates decide whether an agent may act
 * on analytics data for a product. Every check is static (it reads files; it does
 * not load the page or watch network traffic), and each finding says what was
 * actually checked.
 *
 * Statuses: PASS, FAIL, WARN, INFO, NOT_CHECKED (a check that could not run).
 * Overall: CLEARED, CLEARED_WITH_GAPS (passed, but something was not checked), BLOCKED.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const CONSENT_FILENAMES = ['consent.js', 'cookie-consent.js', 'da-consent.js', 'consent.mjs', 'cookie-consent.mjs'];

// Script sources that send analytics or session-replay data as soon as they load.
export const TRACKER_PATTERNS = [
  /googletagmanager\.com\/(gtag\/js|gtm\.js)/i,
  /google-analytics\.com\/(analytics|ga)\.js/i,
  /plausible\.io\/js\//i,
  /static\.hotjar\.com/i,
  /clarity\.ms\/tag/i,
  /cdn\.segment\.com/i,
  /posthog/i,
  /connect\.facebook\.net\/.*fbevents/i
];

export const TRAP_PHRASES = ['in development', 'not yet for sale', 'coming soon', 'mock data', 'preview only'];

// Below this many conversions a week, a 50/50 A/B test cannot reliably detect realistic effect sizes.
export const AB_TEST_MIN_WEEKLY_CONVERSIONS = 1000;

const SCAN_EXTENSIONS = new Set(['.html', '.htm', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte', '.astro']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.output', 'coverage', 'telemetry-audit-output']);

function finding(status, message) {
  return { status, message };
}

function readIfExists(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

/** Lists source files under targetDir (bounded, skips build output and dependencies). */
export function listSourceFiles(targetDir, limit = 5000) {
  const out = [];
  const walk = (dir) => {
    if (out.length >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= limit) return;
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile() && (SCAN_EXTENSIONS.has(path.extname(e.name).toLowerCase()) || e.name.startsWith('.env'))) out.push(full);
    }
  };
  walk(targetDir);
  return out;
}

/** Finds <script src="..."> tags in HTML that load a known tracker directly. */
export function findDirectTrackerScripts(html) {
  const found = [];
  const re = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const src = m[1];
    // type="text/plain" (with a data-category or similar) is the usual way a consent manager holds a script back.
    if (/\btype\s*=\s*["']text\/plain["']/i.test(tag)) continue;
    if (TRACKER_PATTERNS.some((p) => p.test(src))) found.push(src);
  }
  return found;
}

/** True when the HTML sets Google Consent Mode to denied by default before anything loads. */
export function hasConsentModeDefaultDenied(html) {
  return /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"][\s\S]{0,400}?denied/i.test(html);
}

export function runGate0(product, targetDir) {
  const result = { name: 'Gate 0: Consent Check', passed: false, findings: [] };
  const consent = product.consent_gate || {};

  if (consent.required === false) {
    result.passed = true;
    result.findings.push(finding('PASS', 'Registry says this product collects no analytics, so no consent gate is required.'));
    const htmlFiles = listSourceFiles(targetDir).filter((f) => /\.html?$/i.test(f));
    const trackers = htmlFiles.flatMap((f) => findDirectTrackerScripts(readIfExists(f) || ''));
    if (trackers.length > 0) {
      result.passed = false;
      result.findings.push(finding('FAIL', `Registry says no analytics, but HTML loads tracker script(s): ${[...new Set(trackers)].join(', ')}.`));
    }
    return result;
  }

  const htmlFiles = listSourceFiles(targetDir).filter((f) => /\.html?$/i.test(f));
  for (const file of htmlFiles) {
    const html = readIfExists(file) || '';
    const trackers = findDirectTrackerScripts(html);
    if (trackers.length > 0 && !hasConsentModeDefaultDenied(html)) {
      result.findings.push(finding('FAIL', `${path.relative(targetDir, file)} loads tracker script(s) directly, before any consent choice: ${trackers.join(', ')}.`));
    }
  }
  if (result.findings.length > 0) return result;

  const candidates = [consent.file, ...CONSENT_FILENAMES].filter(Boolean);
  const consentFile = candidates.map((f) => path.resolve(targetDir, f)).find((f) => fs.existsSync(f));
  if (!consentFile) {
    result.findings.push(finding('FAIL', `Consent is required but no consent file was found (looked for ${candidates.join(', ')}). Set consent_gate.file in the registry if yours has another name.`));
    return result;
  }

  result.passed = true;
  result.findings.push(finding('PASS', `Consent file found: ${path.relative(targetDir, consentFile)}. No HTML file loads a known tracker script directly.`));
  result.findings.push(finding('INFO', 'This is a static check. It does not prove the consent file works; test the banner in a browser.'));
  if (htmlFiles.length === 0) {
    result.findings.push(finding('NOT_CHECKED', 'No HTML files found, so direct tracker scripts were not checked.'));
  }
  return result;
}

export function runGate1(product, targetDir) {
  const result = { name: 'Gate 1: Measurement Integrity and Telemetry Trap', passed: false, findings: [] };
  const files = listSourceFiles(targetDir);
  const htmlFiles = files.filter((f) => /\.html?$/i.test(f));

  if (htmlFiles.length === 0) {
    result.findings.push(finding('NOT_CHECKED', 'No HTML files found, so the telemetry trap check did not run.'));
  } else {
    const traps = new Set();
    for (const file of htmlFiles) {
      const text = (readIfExists(file) || '').toLowerCase();
      for (const phrase of TRAP_PHRASES) if (text.includes(phrase)) traps.add(phrase);
    }
    if (traps.size > 0) {
      result.findings.push(finding('TRAP_ALERT', `Telemetry trap: the product is marked [${[...traps].join(', ')}]. Zero conversions may be intentional, so automated optimisation is blocked.`));
      return result;
    }
  }

  const mId = product.telemetry?.measurement_id;
  if (!mId || mId === 'none') {
    result.findings.push(finding('INFO', 'No measurement ID registered. Nothing to measure, so there is nothing to optimise against yet.'));
  } else if (product.telemetry?.verify_in_code === false) {
    result.findings.push(finding('NOT_CHECKED', `Measurement ID ${mId} is registered but verify_in_code is false, so it was not looked for in the code.`));
  } else {
    const inCode = files.find((f) => (readIfExists(f) || '').includes(mId));
    if (!inCode) {
      result.findings.push(finding('FAIL', `Registry says measurement ID ${mId}, but it does not appear in any source or .env file. The numbers you are reading may not come from this code.`));
      return result;
    }
    result.findings.push(finding('PASS', `Measurement ID ${mId} found in ${path.relative(targetDir, inCode)}.`));
  }

  result.passed = true;
  return result;
}

export function runGate2(product) {
  const result = { name: 'Gate 2: Outcome Metric and Countermetric', passed: false, findings: [] };
  const metrics = product.metrics || {};

  if (!metrics.primary_metric) {
    result.findings.push(finding('FAIL', 'No primary metric defined for this product.'));
    return result;
  }
  result.findings.push(finding('PASS', `Primary metric: ${metrics.primary_metric}${metrics.primary_description ? ` (${metrics.primary_description})` : ''}.`));

  if (!metrics.countermetric) {
    result.findings.push(finding('FAIL', 'No countermetric defined. Without one, optimising the primary metric can quietly damage the product.'));
    return result;
  }
  result.findings.push(finding('PASS', `Countermetric: ${metrics.countermetric}${metrics.countermetric_description ? ` (${metrics.countermetric_description})` : ''}.`));

  if (Array.isArray(metrics.guardrails) && metrics.guardrails.length > 0) {
    result.findings.push(finding('INFO', `Declared guardrails (not checked by this gate): ${metrics.guardrails.join(', ')}.`));
  }

  result.passed = true;
  return result;
}

export function runGate3(product) {
  const result = { name: 'Gate 3: Cohort Size and Method Selection', passed: true, findings: [] };
  const weekly = product.metrics?.weekly_conversions;
  const method = product.optimization_method || 'deterministic_audit_and_qualitative_probe';

  if (typeof weekly !== 'number' || !Number.isFinite(weekly) || weekly < 0) {
    result.findings.push(finding('INFO', `No weekly_conversions figure in the registry, so the low-traffic rule applies: no 50/50 A/B tests. Approved method: ${method}.`));
    return result;
  }
  if (weekly < AB_TEST_MIN_WEEKLY_CONVERSIONS) {
    result.findings.push(finding('INFO', `${weekly} conversions a week is below ${AB_TEST_MIN_WEEKLY_CONVERSIONS}: 50/50 A/B tests would mostly measure noise. Approved method: ${method}.`));
  } else {
    result.findings.push(finding('INFO', `${weekly} conversions a week: A/B testing is possible, but run a power calculation for your expected effect size first. Approved method: ${method}.`));
  }
  return result;
}

function resolveInvariantTool() {
  const sibling = path.resolve(__dirname, '../../skill-system-invariant-engine/bin/invariant-check.mjs');
  if (fs.existsSync(sibling)) return { file: process.execPath, prefix: [sibling] };
  return { file: 'wb4g-invariants', prefix: [] };
}

export function runGate4(targetDir, options = {}) {
  const result = { name: 'Gate 4: System Invariants', passed: false, findings: [] };

  if (options.skipInvariants) {
    result.passed = true;
    result.findings.push(finding('NOT_CHECKED', 'Invariant check skipped (--skip-invariants).'));
    return result;
  }

  const tool = options.invariantTool || resolveInvariantTool();
  try {
    execFileSync(tool.file, [...tool.prefix, '--dir', targetDir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    result.passed = true;
    result.findings.push(finding('PASS', 'wb4g-invariants passed with the rules configured for this repo.'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      result.findings.push(finding('FAIL', 'wb4g-invariants is not installed, so invariants were not checked. Install skill-system-invariant-engine or pass --skip-invariants.'));
      return result;
    }
    const output = `${err.stdout || ''}${err.stderr || ''}`.trim();
    const why = err.status === 2 ? 'could not run (bad options or config)' : 'found violations';
    result.findings.push(finding('FAIL', `wb4g-invariants ${why}:\n${output.slice(0, 600)}`));
  }
  return result;
}

/** Gate 5 checks that the decision can be recorded. The record itself is written by evaluateProduct. */
export function runGate5(outputDir) {
  const result = { name: 'Gate 5: Recording', passed: false, findings: [] };
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.accessSync(outputDir, fs.constants.W_OK);
    result.passed = true;
    result.findings.push(finding('PASS', `Decision will be recorded in ${outputDir}.`));
  } catch (err) {
    result.findings.push(finding('FAIL', `Cannot write the decision record to ${outputDir}: ${err.message}`));
  }
  return result;
}

export function overallStatus(gates, { strict = false } = {}) {
  if (!gates.every((g) => g.passed)) return 'BLOCKED';
  const gaps = gates.some((g) => g.findings.some((f) => f.status === 'NOT_CHECKED'));
  if (!gaps) return 'CLEARED';
  return strict ? 'BLOCKED' : 'CLEARED_WITH_GAPS';
}

export async function evaluateProduct(product, targetDir, options = {}) {
  const outputDir = options.outputDir || path.resolve(process.cwd(), 'telemetry-audit-output');
  const gates = [
    runGate0(product, targetDir),
    runGate1(product, targetDir),
    runGate2(product),
    runGate3(product),
    runGate4(targetDir, options),
    runGate5(outputDir)
  ];
  const status = overallStatus(gates, options);
  const result = {
    product: product.key,
    name: product.name,
    targetDir,
    timestamp: new Date().toISOString(),
    passed: status !== 'BLOCKED',
    overall_status: status,
    method: product.optimization_method || null,
    gates
  };

  if (gates[5].passed) {
    const safeKey = String(product.key || 'product').replace(/[^\w.-]/g, '_');
    const reportPath = path.join(outputDir, `${safeKey}-audit.json`);
    fs.writeFileSync(reportPath, JSON.stringify(result, null, 2), 'utf8');
    result.reportPath = reportPath;
  }
  return result;
}
