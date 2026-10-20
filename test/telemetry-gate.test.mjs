/**
 * test/telemetry-gate.test.mjs
 * Run with: node --test test/
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  runGate0,
  runGate1,
  runGate2,
  runGate3,
  runGate4,
  runGate5,
  evaluateProduct,
  findDirectTrackerScripts
} from '../lib/telemetry-engine.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'bin', 'telemetry-gate.mjs');
const GTAG = '<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script>';
const EM_DASH = String.fromCharCode(0x2014);

function project(files = { 'index.html': '<html><body><h1>App</h1></body></html>' }) {
  const dir = mkdtempSync(join(tmpdir(), 'wb4g-tel-'));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content, 'utf8');
  }
  return dir;
}

function cli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
}

const fullProduct = (extra = {}) => ({
  key: 'sample-app',
  name: 'Sample App',
  consent_gate: { required: true },
  telemetry: { measurement_id: 'G-ABC123' },
  metrics: { primary_metric: 'completion_rate', countermetric: 'abandonment_rate' },
  optimization_method: 'deterministic_audit',
  ...extra
});

test('Gate 0: passes a product that declares no analytics and loads none', () => {
  const dir = project();
  try {
    const res = runGate0({ consent_gate: { required: false } }, dir);
    assert.equal(res.passed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Gate 0: fails a product that declares no analytics but loads a tracker', () => {
  const dir = project({ 'index.html': `<html><head>${GTAG}</head></html>` });
  try {
    const res = runGate0({ consent_gate: { required: false } }, dir);
    assert.equal(res.passed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Gate 0: fails a tracker loaded directly in HTML', () => {
  const dir = project({ 'index.html': `<html><head>${GTAG}</head></html>`, 'consent.js': '//' });
  try {
    const res = runGate0({ consent_gate: { required: true } }, dir);
    assert.equal(res.passed, false);
    assert.equal(res.findings[0].status, 'FAIL');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('regression: Gate 0 is not fooled by the word "consent" appearing on the page', () => {
  // v1 passed this page and reported "Zero unconsented beacons".
  const dir = project({ 'index.html': `<html><head>${GTAG}</head><body><a href="/privacy">Privacy and consent policy</a></body></html>` });
  try {
    const res = runGate0({ consent_gate: { required: true, mechanism: 'cookie-banner' } }, dir);
    assert.equal(res.passed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('regression: Gate 0 does not accept a registry claim with no consent file', () => {
  // v1 passed whenever consent_gate.mechanism was set, even with nothing in the repo.
  const dir = project();
  try {
    const res = runGate0({ consent_gate: { required: true, mechanism: 'cookie-banner' } }, dir);
    assert.equal(res.passed, false);
    assert.match(res.findings[0].message, /no consent file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Gate 0: accepts Google Consent Mode defaulting to denied, and a named consent file', () => {
  const html = `<html><head><script>gtag('consent', 'default', { analytics_storage: 'denied' });</script>${GTAG}</head></html>`;
  const dir = project({ 'index.html': html, 'src/privacy-gate.js': '//' });
  try {
    const res = runGate0({ consent_gate: { required: true, file: 'src/privacy-gate.js' } }, dir);
    assert.equal(res.passed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('findDirectTrackerScripts ignores scripts held back with type="text/plain"', () => {
  assert.deepEqual(findDirectTrackerScripts('<script type="text/plain" data-category="analytics" src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>'), []);
  assert.equal(findDirectTrackerScripts(GTAG).length, 1);
});

test('Gate 1: telemetry trap blocks optimisation', () => {
  const dir = project({ 'index.html': '<p>In development: not yet for sale</p>' });
  try {
    const res = runGate1({ telemetry: { measurement_id: 'G-TEST01' } }, dir);
    assert.equal(res.passed, false);
    assert.equal(res.findings[0].status, 'TRAP_ALERT');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('regression: Gate 1 fails when the registered measurement ID is not in the code', () => {
  // v1 reported "Measurement ID registered" without looking at the code.
  const dir = project();
  try {
    const res = runGate1({ telemetry: { measurement_id: 'G-NOTHERE' } }, dir);
    assert.equal(res.passed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Gate 1: finds a measurement ID in a .env file', () => {
  const dir = project({ 'index.html': '<html></html>', '.env.production': 'VITE_GA_ID=G-ENV42' });
  try {
    assert.equal(runGate1({ telemetry: { measurement_id: 'G-ENV42' } }, dir).passed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Gate 2: rejects a missing countermetric, accepts both', () => {
  assert.equal(runGate2({ metrics: { primary_metric: 'x' } }).passed, false);
  assert.equal(runGate2({ metrics: { primary_metric: 'x', countermetric: 'y' } }).passed, true);
});

test('regression: Gate 3 does not invent a traffic figure', () => {
  // v1 always said "Traffic volume is focused (<1,000 weekly conversions)" with no data.
  const noData = runGate3({});
  assert.match(noData.findings[0].message, /No weekly_conversions figure/);
  const big = runGate3({ metrics: { weekly_conversions: 5000 } });
  assert.match(big.findings[0].message, /power calculation/);
});

test('regression: Gate 4 runs the invariant engine with --dir and reports its verdict', () => {
  // v1 passed the directory as a positional argument, which wb4g-invariants 2.x rejects.
  const sibling = resolve(ROOT, '../skill-system-invariant-engine/bin/invariant-check.mjs');
  if (!existsSync(sibling)) return;
  const clean = project({ 'a.js': 'export const a = 1;\n' });
  const dirty = project({ 'a.js': `// one ${EM_DASH} two\n` });
  try {
    assert.equal(runGate4(clean).passed, true);
    const res = runGate4(dirty);
    assert.equal(res.passed, false);
    assert.match(res.findings[0].message, /found violations/);
  } finally {
    rmSync(clean, { recursive: true, force: true });
    rmSync(dirty, { recursive: true, force: true });
  }
});

test('Gate 4: a missing invariant tool fails, it is not treated as a pass', () => {
  const res = runGate4(tmpdir(), { invariantTool: { file: 'wb4g-no-such-tool-xyz', prefix: [] } });
  assert.equal(res.passed, false);
  assert.match(res.findings[0].message, /not installed/);
});

test('Gate 5: reports when the record cannot be written', () => {
  const dir = project();
  try {
    assert.equal(runGate5(join(dir, 'out')).passed, true);
    assert.equal(runGate5(join(dir, 'index.html', 'out')).passed, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('evaluateProduct: skipped invariants give CLEARED_WITH_GAPS, and --strict blocks', async () => {
  const dir = project({ 'index.html': '<html><script src="consent.js"></script><script>/* G-ABC123 */</script></html>', 'consent.js': '//' });
  try {
    const res = await evaluateProduct(fullProduct(), dir, { skipInvariants: true, outputDir: join(dir, 'out') });
    assert.equal(res.overall_status, 'CLEARED_WITH_GAPS');
    assert.equal(res.passed, true);
    const record = JSON.parse(readFileSync(res.reportPath, 'utf8'));
    assert.equal(record.overall_status, 'CLEARED_WITH_GAPS');
    const strict = await evaluateProduct(fullProduct(), dir, { skipInvariants: true, strict: true, outputDir: join(dir, 'out') });
    assert.equal(strict.overall_status, 'BLOCKED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('regression: CLI refuses an unregistered directory instead of clearing it as another product', () => {
  // v1 fell back to the first registry entry (or a made-up product) and printed CLEARED.
  const dir = project({});
  try {
    const r = cli(['--dir', dir, '--skip-invariants', '--output-dir', join(dir, 'out')], dir);
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /No product-registry.json found/);
    writeFileSync(join(dir, 'product-registry.json'), JSON.stringify({ products: { other: { path: '../elsewhere' } } }));
    const r2 = cli(['--skip-invariants', '--output-dir', join(dir, 'out')], dir);
    assert.equal(r2.status, 2);
    assert.match(r2.stderr, /No registry entry has a path matching/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: registry paths resolve relative to the registry file, and bad options exit 2', () => {
  const dir = project({ 'app/index.html': '<html><script src="consent.js"></script></html>', 'app/consent.js': '//' });
  try {
    const registry = { products: { app: { path: './app', consent_gate: { required: true }, metrics: { primary_metric: 'a', countermetric: 'b' } } } };
    writeFileSync(join(dir, 'product-registry.json'), JSON.stringify(registry));
    const r = cli(['--registry', join(dir, 'product-registry.json'), '--product', 'app', '--skip-invariants', '--json', '--output-dir', join(dir, 'out')], tmpdir());
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.equal(JSON.parse(r.stdout).targetDir, join(dir, 'app'));
    assert.equal(cli(['--bogus'], dir).status, 2);
    assert.equal(cli(['--product', 'missing', '--registry', join(dir, 'product-registry.json')], dir).status, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
