// Reproducible Node.js benchmark for the public database-opening path.
// Run from the repository root with:
//   npm --prefix packages/kdbx-wasm run benchmark
// Override sample counts with BENCH_WARMUP and BENCH_ITERATIONS.

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const defaultFixture = fileURLToPath(
    new URL('../crates/kdbx-core/tests/fixtures/pass.kdbx', import.meta.url)
);
const fixture = process.argv[2] ? resolve(process.argv[2]) : defaultFixture;
const data = new Uint8Array(readFileSync(fixture));
const password = process.argv[3] ?? 'redhat';
const warmupCount = Number.parseInt(process.env.BENCH_WARMUP ?? '2', 10);
const iterationCount = Number.parseInt(process.env.BENCH_ITERATIONS ?? '10', 10);

if (!Number.isInteger(warmupCount) || warmupCount < 0 ||
    !Number.isInteger(iterationCount) || iterationCount < 1) {
    throw new Error('BENCH_WARMUP must be >= 0 and BENCH_ITERATIONS must be >= 1');
}

// Importing the Node entry also reads and compiles the .wasm and initializes it.
const importStart = performance.now();
const { KdbxDatabase, getFileInfo } = await import('../packages/kdbx-wasm/index.js');
const moduleInitMs = performance.now() - importStart;
const fileInfo = getFileInfo(data);

const samples = [];
let entryCount = 0;
let groupCount = 0;
let fieldCount = 0;
let protectedFieldReveal = false;
for (let i = 0; i < warmupCount + iterationCount; i += 1) {
    const start = performance.now();
    const db = new KdbxDatabase(data, password);
    const elapsed = performance.now() - start;

    // Read metadata outside the timed region and retain a correctness signal.
    entryCount = db.headerInfo.entryCount;
    groupCount = db.headerInfo.groupCount;
    const entries = db.getEntries();
    if (entries.length !== entryCount) {
        throw new Error(`Expected ${entryCount} entries, received ${entries.length}`);
    }
    fieldCount = entries.reduce((count, entry) => count + Object.keys(entry.fields).length, 0);
    const protectedPassword = entries.find((entry) => entry.fields.password?.protected);
    if (protectedPassword) {
        if (protectedPassword.fields.password.value !== null) {
            throw new Error('Protected password appeared in entry snapshot');
        }
        if (typeof db.getEntryField(protectedPassword.uuid, 'password') !== 'string') {
            throw new Error('Protected password reveal did not return plaintext');
        }
        protectedFieldReveal = true;
    }
    if (i >= warmupCount) samples.push(elapsed);
}

const sorted = [...samples].sort((a, b) => a - b);
const sum = samples.reduce((total, value) => total + value, 0);
const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
const median = sorted.length % 2 === 1
    ? sorted[Math.floor(sorted.length / 2)]
    : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;

console.log(JSON.stringify({
    benchmark: 'new KdbxDatabase(data, password)',
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    fixtureBytes: statSync(fixture).size,
    kdf: fileInfo.kdfAlgorithm,
    entries: entryCount,
    groups: groupCount,
    fields: fieldCount,
    protectedFieldReveal,
    moduleInitMs: Number(moduleInitMs.toFixed(3)),
    warmupCount,
    iterations: iterationCount,
    openMs: {
        min: Number(sorted[0].toFixed(3)),
        median: Number(median.toFixed(3)),
        mean: Number((sum / samples.length).toFixed(3)),
        p95: Number(percentile(0.95).toFixed(3)),
        max: Number(sorted.at(-1).toFixed(3)),
    },
}, null, 2));
