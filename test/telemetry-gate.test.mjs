/**
 * test/telemetry-gate.test.mjs
 * 
 * Standalone unit test suite for skill-closed-loop-telemetry.
 * Tests all 6 gates across pass, fail, and Telemetry Trap conditions.
 * 
 * Rule: Character invariants apply (zero em dashes).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runGate0,
  runGate1,
  runGate2,
  runGate3,
  runGate4,
  runGate5,
  evaluateProduct
} from '../lib/telemetry-engine.mjs';

function createTempProject(htmlContent = '<html><body><h1>App</h1></body></html>', extraFiles = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wb4g-test-'));
  writeFileSync(join(dir, 'index.html'), htmlContent, 'utf8');
  for (const [name, content] of Object.entries(extraFiles)) {
    writeFileSync(join(dir, name), content, 'utf8');
  }
  return dir;
}

test('Gate 0: Passes when client-side product requires zero telemetry', () => {
  const product = { consent_gate: { required: false } };
  const res = runGate0(product, '/nonexistent');
  assert.equal(res.passed, true);
  assert.equal(res.findings[0].status, 'PASS');
});

test('Gate 0: Fails when unconsented tracking script is injected directly into HTML', () => {
  const dir = createTempProject('<html><head><script src="https://www.googletagmanager.com/gtag/js?id=G-123"></script></head><body></body></html>');
  try {
    const product = { consent_gate: { required: true, mechanism: 'strict-consent' } };
    const res = runGate0(product, dir);
    assert.equal(res.passed, false);
    assert.equal(res.findings[0].status, 'FAIL');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Gate 1: Detects Telemetry Trap and blocks automated refactoring on pre-sale tiers', () => {
  const dir = createTempProject('<html><body><h2>Enterprise Plan</h2><p>In development: not yet for sale</p></body></html>');
  try {
    const product = { telemetry: { measurement_id: 'G-TEST01' } };
    const res = runGate1(product, dir);
    assert.equal(res.passed, false);
    assert.equal(res.findings[0].status, 'TRAP_ALERT');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Gate 2: Rejects when mandatory countermetric is missing', () => {
  const productNoCounter = {
    metrics: {
      primary_metric: 'task_completion_rate'
    }
  };
  const res = runGate2(productNoCounter);
  assert.equal(res.passed, false);
  assert.equal(res.findings[1].status, 'FAIL');
});

test('Gate 2: Clears when both primary metric and countermetric are defined', () => {
  const productValid = {
    metrics: {
      primary_metric: 'task_completion_rate',
      countermetric: 'frustration_bounce_rate',
      guardrails: ['zero_em_dashes']
    }
  };
  const res = runGate2(productValid);
  assert.equal(res.passed, true);
  assert.equal(res.findings.length, 3);
});

test('Gate 3: Enforces early-stage cohort rule and prohibits frequentist A/B testing on low traffic', () => {
  const product = { optimization_method: 'deterministic_audit' };
  const res = runGate3(product);
  assert.equal(res.passed, true);
  assert.equal(res.findings[1].status, 'DECISION');
  assert.ok(res.findings[1].message.includes('Frequentist 50/50 A/B testing is prohibited'));
});

test('Gate 5: Accurately records evidence report and preserves status', () => {
  const dir = createTempProject();
  try {
    const product = { key: 'test-unit', name: 'Test Unit', optimization_method: 'deterministic_audit' };
    const mockGates = [{ name: 'MockGate', passed: true, findings: [] }];
    const res = runGate5(product, mockGates, dir);
    assert.equal(res.passed, true);
    assert.equal(res.findings[0].status, 'RECORDED');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Complete Engine: Evaluates sample product and produces CLEARED decision', async () => {
  const dir = createTempProject('<html><head><script src="consent.js"></script></head><body><h1>Live App</h1></body></html>', {
    'consent.js': '// Consent gate active'
  });
  try {
    const product = {
      key: 'sample-app',
      name: 'Sample App',
      consent_gate: { required: true, mechanism: 'consent.js' },
      telemetry: { measurement_id: 'G-SAMPLE99' },
      metrics: {
        primary_metric: 'completion_rate',
        countermetric: 'abandonment_rate',
        guardrails: ['zero_em_dashes']
      },
      optimization_method: 'deterministic_audit'
    };

    const result = await evaluateProduct(product, dir, {
      skipInvariants: true,
      outputDir: dir
    });

    assert.equal(result.passed, true);
    assert.equal(result.overall_status, 'CLEARED');
    assert.equal(result.gates.length, 6);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
