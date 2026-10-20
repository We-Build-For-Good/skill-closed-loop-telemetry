#!/usr/bin/env node
/**
 * bin/telemetry-gate.mjs
 *
 * We Build for Good: Closed-Loop Telemetry Gate CLI.
 * Exit codes: 0 cleared, 1 blocked, 2 bad options or no matching product.
 */

import fs from 'node:fs';
import path from 'node:path';
import { evaluateProduct } from '../lib/telemetry-engine.mjs';

const HELP = `
We Build for Good: Closed-Loop Telemetry Gate (wb4g-telemetry-gate)

Usage:
  wb4g-telemetry-gate [dir] [options]

Options:
  --registry <path>    Product registry (default: product-registry.json in the
                       current directory, then in the target directory)
  --product <key>      Product key in the registry (default: the entry whose
                       "path" matches the target directory)
  --dir <path>         Directory to check (default: the product's path, then
                       the current directory)
  --output-dir <path>  Where the decision record is written
                       (default: ./telemetry-audit-output)
  --skip-invariants    Do not run wb4g-invariants (reported as a gap)
  --strict             Block when any check could not run
  --json               Print the result as JSON
  --help, -h           Show this help

Gates:
  0 Consent check            3 Cohort size and method selection
  1 Measurement integrity    4 System invariants (wb4g-invariants)
  2 Metric + countermetric   5 Recording

Exit codes: 0 CLEARED or CLEARED_WITH_GAPS, 1 BLOCKED, 2 bad options or no product.
`;

function parseArgs(args) {
  const options = { registryPath: null, product: null, dir: null, outputDir: null, json: false, skipInvariants: false, strict: false, help: false, errors: [] };
  const valueFlags = { '--registry': 'registryPath', '--product': 'product', '--dir': 'dir', '--output-dir': 'outputDir' };
  const boolFlags = { '--json': 'json', '--skip-invariants': 'skipInvariants', '--strict': 'strict', '--help': 'help', '-h': 'help' };
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    let arg = args[i];
    let inline = null;
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq > 0) {
      inline = arg.slice(eq + 1);
      arg = arg.slice(0, eq);
    }
    if (boolFlags[arg]) options[boolFlags[arg]] = true;
    else if (valueFlags[arg]) {
      const value = inline ?? (i + 1 < args.length && !args[i + 1].startsWith('--') ? args[++i] : null);
      if (value === null || value === '') options.errors.push(`${arg} needs a value.`);
      else options[valueFlags[arg]] = value;
    } else if (arg.startsWith('-')) options.errors.push(`Unknown option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length > 1) options.errors.push(`Expected at most one directory, got: ${positional.join(' ')}`);
  if (positional.length === 1) {
    if (options.dir) options.errors.push('Give the directory either as an argument or with --dir, not both.');
    else options.dir = positional[0];
  }
  if (options.dir) options.dir = path.resolve(options.dir);
  if (options.outputDir) options.outputDir = path.resolve(options.outputDir);
  return options;
}

class UsageError extends Error {}

function loadRegistry(options) {
  const candidates = options.registryPath
    ? [path.resolve(options.registryPath)]
    : [path.resolve('product-registry.json'), ...(options.dir ? [path.join(options.dir, 'product-registry.json')] : [])];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new UsageError(options.registryPath
      ? `Registry not found: ${candidates[0]}`
      : 'No product-registry.json found. Create one (see examples/product-registry.json) or pass --registry.');
  }
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(found, 'utf8'));
  } catch (err) {
    throw new UsageError(`Could not read registry ${found}: ${err.message}`);
  }
  if (!registry || typeof registry.products !== 'object') throw new UsageError(`Registry ${found} has no "products" object.`);
  return { registry, registryPath: found, registryDir: path.dirname(found) };
}

/** Finds the product. Never guesses: no match is an error, not a default product. */
function resolveProduct({ registry, registryDir }, options) {
  const products = registry.products || {};
  const withPath = (key) => {
    const p = products[key];
    return { key, ...p, resolvedPath: p.path ? path.resolve(registryDir, p.path) : null };
  };

  if (options.product) {
    if (!products[options.product]) {
      throw new UsageError(`Product "${options.product}" is not in the registry. Known: ${Object.keys(products).join(', ') || '(none)'}.`);
    }
    return withPath(options.product);
  }

  const target = options.dir || process.cwd();
  const matches = Object.keys(products).map(withPath).filter((p) => p.resolvedPath === target);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    throw new UsageError(`Several registry entries point at ${target} (${matches.map((m) => m.key).join(', ')}). Pass --product.`);
  }
  throw new UsageError(`No registry entry has a path matching ${target}. Pass --product, or add an entry for this directory.`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return 0;
  }
  if (options.errors.length) {
    options.errors.forEach((e) => console.error(`Error: ${e}`));
    return 2;
  }

  let product;
  try {
    product = resolveProduct(loadRegistry(options), options);
  } catch (err) {
    if (err instanceof UsageError) {
      console.error(`Error: ${err.message}`);
      return 2;
    }
    throw err;
  }

  const targetDir = options.dir || product.resolvedPath || process.cwd();
  if (!fs.existsSync(targetDir) || !fs.statSync(targetDir).isDirectory()) {
    console.error(`Error: directory not found: ${targetDir}`);
    return 2;
  }

  const result = await evaluateProduct(product, targetDir, options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.passed ? 0 : 1;
  }

  console.log('===========================================================');
  console.log(' We Build for Good: Closed-Loop Telemetry Gate');
  console.log(` Product : ${result.name || result.product} (${result.product})`);
  console.log(` Path    : ${targetDir}`);
  console.log('===========================================================\n');
  for (const gate of result.gates) {
    console.log(`[${gate.passed ? 'PASS' : 'FAIL'}] ${gate.name}`);
    for (const f of gate.findings) console.log(`    [${f.status}] ${f.message}`);
    console.log('');
  }
  console.log('===========================================================');
  if (result.overall_status === 'CLEARED') console.log(` CLEARED. Approved method: ${result.method || '(not set)'}`);
  else if (result.overall_status === 'CLEARED_WITH_GAPS') console.log(` CLEARED WITH GAPS: some checks did not run (see NOT_CHECKED). Approved method: ${result.method || '(not set)'}`);
  else console.log(' BLOCKED: resolve the failures above before optimising.');
  if (result.reportPath) console.log(` Record : ${result.reportPath}`);
  console.log('===========================================================');
  return result.passed ? 0 : 1;
}

main().then(
  (code) => { process.exitCode = code; },
  (err) => {
    console.error(`Fatal error: ${err.message}`);
    process.exitCode = 1;
  }
);
