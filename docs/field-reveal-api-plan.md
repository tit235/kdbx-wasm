# Plan: Field map, `reveal()`, and JS wrapper

## Goals

1. **kdbx-core** stores per-field `protected` metadata; protected plaintext never appears in entry snapshots crossing to JS.
2. **`getEntryField(uuid, fieldName)`** (WASM) is the dedicated path to copy a protected value into JavaScript.
3. **Remove `includePassword`** from all entry read APIs.
4. **Public JS API** wraps the raw WASM database: frozen field objects with **`reveal()`**, plus **getters** for standard fields (`title`, `username`, `password`, `url`, `notes`).
5. **Field names in JS** use **camelCase** (`title`, `password`, `otpSecret`, …). Rust keeps **KeePass wire names** internally (`Title`, `UserName`, `Password`, …) and maps at the WASM/JS boundary—no duplicate top-level convenience fields on the Rust export.

## Target shapes

### WASM / serde export (no convenience duplicates)

```ts
// Raw shape from wasm-bindgen (wrapper consumes this; apps should not rely on raw glue long-term)
interface RawFieldData {
  value: string | null; // always null when protected === true
  protected: boolean;
}

interface RawKdbxEntry {
  uuid: string;
  iconId: number;
  groupId: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  accessedAt: string;
  expiresAt?: string;
  fields: Record<string, RawFieldData>; // keys are camelCase (see below)
}
```

Rust **does not** export `title`, `username`, `password`, `url`, `notes`, or `customFields` on the entry object. Only metadata + `fields`.

### Public JS entry (after wrapper)

```ts
interface FieldData {
  readonly value: string | null;
  readonly protected: boolean;
  reveal(): string | null | undefined;
}

interface KdbxEntry {
  readonly uuid: string;
  readonly iconId: number;
  readonly groupId: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly accessedAt: string;
  readonly expiresAt?: string;
  readonly fields: Readonly<Record<string, FieldData>>;

  // Standard fields — same FieldData instances as fields.*
  get title(): FieldData | undefined;
  get username(): FieldData | undefined;
  get password(): FieldData | undefined;
  get url(): FieldData | undefined;
  get notes(): FieldData | undefined;
}
```

Example:

```js
const entry = db.getEntry(uuid);
entry.title?.value;           // plain snapshot when !protected
entry.password?.reveal();     // WASM fetch when protected
```

## camelCase field keys

| KeePass / Rust key | JS / WASM `fields` key |
|--------------------|-------------------------|
| `Title`            | `title`                 |
| `UserName`         | `username`              |
| `Password`         | `password`              |
| `URL`              | `url`                   |
| `Notes`            | `notes`                 |
| Custom (e.g. `OTP`) | camelCase derived from key (see rules) |

**Rules**

- Standard five: fixed table above (WASM export uses camelCase keys only).
- Custom fields: convert KeePass key to camelCase in one shared function (Rust `field_key_to_js` + same logic in wrapper for `reveal()` / `getEntryField` if raw keys differ).
  - Prefer a single implementation in Rust for export and for `getEntryField` argument normalization (accept **camelCase** from JS; map to internal KeePass key).
- Wrapper getters use **`this.fields.title`**, not `Title`.

## Breaking changes

| Removed | Replacement |
|---------|-------------|
| `KdbxEntry.password`, `.title`, … top-level strings | `.password`, `.title` getters → `FieldData` |
| `customFields` object | `fields.<camelCaseCustomKey>` |
| `includePassword` on `getEntries`, `getEntry`, `getEntriesByGroup`, `search*` | `entry.fields.password.reveal()` |

Ship as **0.4.0** with CHANGELOG migration section.

---

## Phase 1 — kdbx-core

### 1.1 `EntryField` and `Entry.fields`

```rust
pub struct EntryField {
    pub value: SecString,
    pub protected: bool,
}

// Entry uses HashMap with KeePass keys: "Title", "UserName", "Password", "URL", "Notes", + custom
pub fields: HashMap<String, EntryField>,
```

Replace flat `title`, `username`, `password`, `url`, `notes`, `custom_fields` with `fields` (or migrate incrementally with accessors, then delete flats).

### 1.2 Parse / write

- `parse_value_node` → `(String, bool)` for value + `Protected="True"`.
- Store in `fields` with wire key names.
- `write_string_field`: encrypt when `field.protected` (not only Password).

### 1.3 Search

- MVP: match only **non-protected** field values (same as today for password). Document.

### 1.4 Key mapping module

`crates/kdbx-core` or `kdbx-wasm`:

- `fn field_key_to_js(wire: &str) -> String`
- `fn field_key_from_js(js: &str) -> String` (for `getEntryField`)

### 1.5 Tests

- Protected Title/Notes/custom round-trip.
- Empty Password handling (no duplicate custom key).

---

## Phase 2 — kdbx-wasm

### 2.1 `field_to_js`

```text
if field.protected → value: None
else → value: Some(plaintext) or None if missing
```

Export `fields` as `HashMap` with **camelCase keys** (convert when building `JsEntry`).

### 2.2 `JsEntry`

Metadata only + `fields`. No top-level title/password/etc.

### 2.3 `get_entry_field(uuid, field_name: &str)`

- `field_name` is **camelCase** (JS convention).
- Map to wire key → lookup → return `Option<String>` plaintext.
- Used by protected `reveal()` and optionally for any field.

### 2.4 Remove `include_password`

From `get_entries`, `get_entry`, `get_entries_by_group`, `search_entries`, `search_entries_advanced`.

### 2.5 Mutations

`set_entry_title`, `set_entry_password`, … update `fields` with correct `protected` flags (`Password` always protected).

Rebuild: `./scripts/build-wasm.sh`.

---

## Phase 3 — JS wrapper

### 3.1 Modules

| File | Purpose |
|------|---------|
| `packages/kdbx-wasm/field-keys.js` | camelCase ↔ wire (if needed client-side; prefer WASM accepting camelCase only) |
| `packages/kdbx-wasm/entry-fields.js` | `wrapField`, `wrapEntry`, `deepFreeze` |
| `packages/kdbx-wasm/database.js` | `KdbxDatabase` wrapping raw WASM instance |
| `index.js` | Node: `initSync` + export wrapped API |
| Browser | Same types; `init()` then import wrapped `KdbxDatabase` from package root |

Raw glue: import as `RawKdbxDatabase` from `./kdbx_wasm.js` (internal).

### 3.2 `wrapField(rawDb, uuid, camelName, cell)`

```js
const frozen = Object.freeze({
  value: cell.value ?? null,
  protected: Boolean(cell.protected),
  reveal() {
    return frozen.protected
      ? rawDb.getEntryField(uuid, camelName)
      : frozen.value;
  },
});
return frozen;
```

### 3.3 `wrapEntry(rawDb, raw)`

- Build `fields` from `raw.fields` (already camelCase from WASM).
- Freeze each field object; freeze `fields`; attach getters on entry object:

```js
const entry = {
  uuid: raw.uuid,
  iconId: raw.iconId,
  // ... metadata ...
  fields,
  get title() { return fields.title; },
  get username() { return fields.username; },
  get password() { return fields.password; },
  get url() { return fields.url; },
  get notes() { return fields.notes; },
};
return Object.freeze(entry);
```

Getters return **`FieldData | undefined`** (undefined if key absent).

### 3.4 `KdbxDatabase` wrapper

- Holds `#raw` WASM instance in closure.
- `getEntries()`, `getEntry()`, `getEntriesByGroup()`, `search*()` → map through `wrapEntry`.
- Delegate mutations, `toBytes`, `metadata`, `headerInfo`, … to `#raw`.
- Do **not** expose duplicate metadata on entries from Rust; wrapper may add getters only on **entry** objects as above.

### 3.5 Package exports

- Public: wrapped `KdbxDatabase` from `index.js` / default export path.
- Update `index.d.ts` for `FieldData`, `KdbxEntry`, getters.

---

## Phase 4 — Tests

- `fields.password.protected === true`, `value === null` on fixture.
- `fields.password.reveal()` returns string.
- `entry.password === entry.fields.password` (same reference).
- `entry.title?.value` for non-protected title.
- `getEntryField` matches `reveal()` for protected field.
- No `getEntries(true)`.
- Optional fixture: protected custom field → camelCase key in `fields`.

---

## Phase 5 — Docs

- README: entry shape, camelCase `fields`, standard getters, `reveal()`, security (no logging `reveal()` results).
- CHANGELOG 0.4.0 breaking list.

---

## Implementation order

1. Core `EntryField` + XML + key map helpers  
2. Refactor search / mutations / `Entry::new`  
3. WASM `entry_to_js` + `getEntryField` + drop `includePassword`  
4. `build-wasm.sh`  
5. JS wrapper + `index.js` / exports + `index.d.ts`  
6. Tests + README + version bump  

---

## Invariants (review)

- [ ] Protected fields: snapshot `value` is always `null` from WASM.
- [ ] Rust export: no top-level `title` / `password` / `customFields`.
- [ ] JS: all public field keys camelCase; getters point at `fields.<name>`.
- [ ] `reveal()` does not cache plaintext on the field object.
- [ ] `getEntryField` accepts camelCase names only (document wire keys as internal).

---

## Out of scope (later)

- Meta `MemoryProtection` full KeePass parity on create.
- Search inside protected fields without full decrypt.
- History entries in JS API.
- `setEntryCustomField(..., { protected: true })`.
- Binary attachments as field-like handles.
