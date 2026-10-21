const standardFields = ['title', 'username', 'password', 'url', 'notes'];

export function wrapField(rawDb, uuid, camelName, cell) {
  const field = {
    value: cell.value ?? null,
    protected: Boolean(cell.protected),
    reveal() {
      return field.protected
        ? rawDb.getEntryField(uuid, camelName)
        : field.value;
    },
  };
  return Object.freeze(field);
}

export function wrapEntry(rawDb, raw) {
  const fields = Object.create(null);
  for (const [name, cell] of Object.entries(raw.fields ?? {})) {
    fields[name] = wrapField(rawDb, raw.uuid, name, cell);
  }
  Object.freeze(fields);

  const entry = {
    uuid: raw.uuid,
    iconId: raw.iconId,
    groupId: raw.groupId,
    tags: Object.freeze([...raw.tags]),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    accessedAt: raw.accessedAt,
    ...(raw.expiresAt == null ? {} : { expiresAt: raw.expiresAt }),
    fields,
  };
  for (const name of standardFields) {
    Object.defineProperty(entry, name, {
      enumerable: true,
      get() { return fields[name]; },
    });
  }
  return Object.freeze(entry);
}
