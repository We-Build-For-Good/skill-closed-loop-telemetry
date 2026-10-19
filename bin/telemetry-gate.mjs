#!/usr/bin/env node
/**
 * bin/telemetry-gate.mjs
 * 
 * We Build for Good: Closed-Loop Telemetry Gate CLI
 * Standalone decision gate for evidence-driven product optimization.
 * 
 * Rule: Character invariants apply (zero em dashes).
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateProduct } from '../lib/telemetry-engine.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_EXAMPLE_REGISTRY = resolve(__dirname, '..', 'examples', 'product-registry.json');

function parseArgs(args) {
  const options = {
    registryPath: null,
    product: null,
    dir: null,
    outputDir: null,
    json: false,
    skipInvariants: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--registry' && args[i + 1]) {
      options.registryPath = resolve(args[++i]);
    } else if (arg === '--product' && args[i + 1]) {
      options.product = args[++i];
    } else if (arg === '--dir' && args[i + 1]) {
      options.dir = resolve(args[++i]);
    } else if (arg === '--output-dir' && args[i + 1]) {
      options.outputDir = resolve(args[++i]);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--skip-invariants') {
      options.skipInvariants = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
We Build for Good: Closed-Loop Telemetry Gate (wb4g-telemetry-gate)

Usage:
  wb4g-telemetry-gate [target_dir_or_product] [options]

Options:
  --registry <path>    Path to product-registry.json
  --product <key>      Product key in the registry
  --dir <path>         Target project directory to audit (default: current directory)
  --output-dir <path>  Output directory for audit reports
  --json               Output raw JSON result
  --skip-invariants    Skip external wb4g-invariants binary execution
  --help               Display this help message

The 6-Gate Protocol:
  Gate 0: Invariant & Consent Check
  Gate 1: Measurement Integrity & Telemetry Trap Check
  Gate 2: Outcome Metric & Countermetric Guardrail Diagnosis
  Gate 3: Cohort Power & Experimentation Method Selection
  Gate 4: System Invariant & Visual Sensory Verification
  Gate 5: Controlled Recording & Honest Evidence Logging
      `);
      process.exit(0);
    } else if (!arg.startsWith('-') && !options.product && !options.dir) {
      if (existsSync(arg)) {
        options.dir = resolve(arg);
      } else {
        options.product = arg;
      }
    }
  }

  return options;
}

function loadRegistry(specifiedPath) {
  if (specifiedPath && existsSync(specifiedPath)) {
    return JSON.parse(readFileSync(specifiedPath, 'utf8'));
  }
  const localRegistry = resolve(process.cwd(), 'product-registry.json');
  if (existsSync(localRegistry)) {
    return JSON.parse(readFileSync(localRegistry, 'utf8'));
  }
  if (existsSync(DEFAULT_EXAMPLE_REGISTRY)) {
    return JSON.parse(readFileSync(DEFAULT_EXAMPLE_REGISTRY, 'utf8'));
  }
  return { products: {} };
}

function resolveProduct(registry, options) {
  const products = registry.products || {};
  if (options.product && products[options.product]) {
    return { key: options.product, ...products[options.product] };
  }

  const targetDir = options.dir || process.cwd();
  for (const [key, p] of Object.entries(products)) {
    if (p.path && resolve(p.path) === targetDir) {
      return { key, ...p };
    }
  }

  const firstKey = Object.keys(products)[0];
  if (firstKey) {
    return { key: firstKey, ...products[firstKey] };
  }

  return {
    key: 'standalone-app',
    name: 'Standalone Application',
    path: targetDir,
    consent_gate: { required: true, mechanism: 'detected' },
    telemetry: { provider: 'auto', measurement_id: 'detected' },
    metrics: {
      primary_metric: 'core_task_completion',
      countermetric: 'session_abandonment',
      guardrails: ['zero_em_dashes', 'privacy_first']
    },
    optimization_method: 'deterministic_audit'
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const registry = loadRegistry(options.registryPath);
  const product = resolveProduct(registry, options);
  const targetDir = options.dir || (product.path && existsSync(product.path) ? resolve(product.path) : process.cwd());

  const result = await evaluateProduct(product, targetDir, options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.passed ? 0 : 1);
  }

  console.log('===========================================================');
  console.log(' We Build for Good: Closed-Loop Telemetry Gate');
  console.log(` Target Product       : ${result.name} (${result.product})`);
  console.log(` Path                 : ${targetDir}`);
  console.log(` Date                 : ${new Date().toISOString()}`);
  console.log('===========================================================\n');

  for (const gate of result.gates) {
    const symbol = gate.passed ? '✓' : '✗';
    console.log(`[${symbol}] ${gate.name}`);
    for (const f of gate.findings) {
      console.log(`    [${f.status}] ${f.message}`);
    }
    console.log('');
  }

  console.log('===========================================================');
  if (result.passed) {
    console.log(' Closed-Loop Telemetry Gate: CLEARED FOR OPTIMIZATION');
    console.log(` Method: ${result.method}`);
  } else {
    console.log(' Closed-Loop Telemetry Gate: BLOCKED (Resolve Gate Failures)');
  }
  console.log('===========================================================');

  process.exit(result.passed ? 0 : 1);
}

run().catch(err => {
  console.error('Fatal execution error:', err.message);
  process.exit(1);
});
