import { wrapEntry } from "./entry-fields.js";
import { KdbxDatabase as RawKdbxDatabase } from "./kdbx_wasm.js";

export class KdbxDatabase {
  #raw;

  constructor(data, password, keyFile) {
    this.#raw = new RawKdbxDatabase(data, password, keyFile);
  }

  get metadata() {
    return this.#raw.metadata;
  }
  get headerInfo() {
    return this.#raw.headerInfo;
  }
  get rootGroupUuid() {
    return this.#raw.rootGroupUuid;
  }

  getEntries() {
    return this.#raw.getEntries().map((entry) => wrapEntry(this.#raw, entry));
  }
  getEntry(uuid) {
    return wrapEntry(this.#raw, this.#raw.getEntry(uuid));
  }
  getGroups() {
    return this.#raw.getGroups();
  }
  getGroup(uuid) {
    return this.#raw.getGroup(uuid);
  }
  getEntriesByGroup(groupUuid) {
    return this.#raw
      .getEntriesByGroup(groupUuid)
      .map((entry) => wrapEntry(this.#raw, entry));
  }
  searchEntries(query) {
    return this.#raw
      .searchEntries(query)
      .map((entry) => wrapEntry(this.#raw, entry));
  }
  searchEntriesAdvanced(query, groupUuid, excludeExpired) {
    return this.#raw
      .searchEntriesAdvanced(query, groupUuid, excludeExpired)
      .map((entry) => wrapEntry(this.#raw, entry));
  }

  toBytes(password, keyFile) {
    return this.#raw.toBytes(password, keyFile);
  }
  getEntryField(uuid, fieldName) {
    return this.#raw.getEntryField(uuid, fieldName);
  }

  createEntry(...args) {
    return this.#raw.createEntry(...args);
  }
  deleteEntry(...args) {
    return this.#raw.deleteEntry(...args);
  }
  moveEntry(...args) {
    return this.#raw.moveEntry(...args);
  }
  setEntryTitle(...args) {
    return this.#raw.setEntryTitle(...args);
  }
  setEntryUsername(...args) {
    return this.#raw.setEntryUsername(...args);
  }
  setEntryPassword(...args) {
    return this.#raw.setEntryPassword(...args);
  }
  setEntryUrl(...args) {
    return this.#raw.setEntryUrl(...args);
  }
  setEntryNotes(...args) {
    return this.#raw.setEntryNotes(...args);
  }
  setEntryIconId(...args) {
    return this.#raw.setEntryIconId(...args);
  }
  addEntryTag(...args) {
    return this.#raw.addEntryTag(...args);
  }
  removeEntryTag(...args) {
    return this.#raw.removeEntryTag(...args);
  }
  setEntryCustomField(...args) {
    return this.#raw.setEntryCustomField(...args);
  }
  setEntryExpires(...args) {
    return this.#raw.setEntryExpires(...args);
  }

  createGroup(...args) {
    return this.#raw.createGroup(...args);
  }
  deleteGroup(...args) {
    return this.#raw.deleteGroup(...args);
  }
  renameGroup(...args) {
    return this.#raw.renameGroup(...args);
  }
  setGroupNotes(...args) {
    return this.#raw.setGroupNotes(...args);
  }
  setGroupIconId(...args) {
    return this.#raw.setGroupIconId(...args);
  }

  setDatabaseName(...args) {
    return this.#raw.setDatabaseName(...args);
  }
  setDatabaseDescription(...args) {
    return this.#raw.setDatabaseDescription(...args);
  }
  setDefaultUsername(...args) {
    return this.#raw.setDefaultUsername(...args);
  }
  getChildGroups(...args) {
    return this.#raw.getChildGroups(...args);
  }
}
