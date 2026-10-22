// Smoke tests for the unified ESM package.
// The package entry (index.js) imports the WASM binary through a bundler, so
// plain Node cannot load it directly. These tests exercise the shared glue and
// the wrapped database layer with an explicit initSync() instead.
// Uses the committed fixture at crates/kdbx-core/tests/fixtures/pass.kdbx.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { initSync, isKdbxFile, getFileInfo } from '../kdbx_wasm.js';
import { KdbxDatabase } from '../database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WASM = path.join(__dirname, '..', 'kdbx_wasm_bg.wasm');

const FIXTURE = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'crates',
    'kdbx-core',
    'tests',
    'fixtures',
    'pass.kdbx'
);

initSync({ module: fs.readFileSync(WASM) });

test('isKdbxFile / getFileInfo', () => {
    const data = new Uint8Array(fs.readFileSync(FIXTURE));
    assert.strictEqual(isKdbxFile(data), true);
    assert.strictEqual(isKdbxFile(new Uint8Array([1, 2, 3])), false);

    const info = getFileInfo(data);
    assert.match(info.version, /^4\./);
    assert.ok(['AES-256', 'ChaCha20'].includes(info.encryptionAlgorithm));
    assert.ok(['Argon2d', 'Argon2id', 'AES-KDF'].includes(info.kdfAlgorithm));
});

test('open, query, and round-trip export', () => {
    const data = new Uint8Array(fs.readFileSync(FIXTURE));
    const db = new KdbxDatabase(data, 'redhat');

    const entries = db.getEntries();
    assert.ok(entries.length > 0, 'fixture should contain entries');
    assert.ok(entries.every((e) => e.fields && !(e.fields instanceof Map)));
    assert.ok(entries.every((e) => e.title === e.fields.title));
    assert.ok(entries.every((e) => Object.isFrozen(e) && Object.isFrozen(e.fields)));

    // Sorted, stable output.
    const titles = entries.map((e) => e.fields.title?.value ?? '');
    const sorted = [...titles].sort();
    assert.deepStrictEqual(titles, sorted);

    const protectedEntry = entries.find((entry) => entry.fields.password?.protected);
    assert.ok(protectedEntry, 'fixture should contain a protected password field');
    assert.strictEqual(protectedEntry.fields.password.value, null);
    assert.strictEqual(typeof db.getEntryField(protectedEntry.uuid, 'password'), 'string');
    assert.strictEqual(protectedEntry.password.reveal(), db.getEntryField(protectedEntry.uuid, 'password'));
    assert.strictEqual(protectedEntry.password.value, null, 'reveal must not cache plaintext');
    assert.ok(Object.isFrozen(protectedEntry.password));

    const groups = db.getGroups();
    assert.ok(groups.length > 0);
    assert.ok(db.rootGroupUuid.length > 0);

    // Export with the same password and re-open.
    const exported = db.toBytes('redhat');
    assert.ok(exported instanceof Uint8Array);
    assert.ok(exported.length > 0);

    const db2 = new KdbxDatabase(exported, 'redhat');
    assert.strictEqual(db2.headerInfo.entryCount, db.headerInfo.entryCount);
    assert.strictEqual(db2.headerInfo.groupCount, db.headerInfo.groupCount);

    // Wrong password must be rejected.
    assert.throws(() => new KdbxDatabase(data, 'wrong-password'));
});

test('browser entry surface (kdbx_wasm.js)', async () => {
    const glue = await import('../kdbx_wasm.js');

    // The glue is already initialized above; initSync must be a safe no-op
    // re-run.
    assert.strictEqual(typeof glue.default, 'function');
    assert.strictEqual(typeof glue.initSync, 'function');
    glue.initSync({ module: fs.readFileSync(WASM) });

    const data = new Uint8Array(fs.readFileSync(FIXTURE));
    assert.strictEqual(glue.isKdbxFile(data), true);
    assert.ok(typeof glue.getFileInfo(data).version === 'string');
});

