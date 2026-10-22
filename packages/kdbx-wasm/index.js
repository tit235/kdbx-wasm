import wasmBinary from "./kdbx_wasm_bg.wasm";
export const wasm = wasmBinary;
// Node entry: callers provide the WASM module or path explicitly.
export { initSync, default as initAsync } from "./kdbx_wasm.js";
export { KdbxDatabase } from "./database.js";
export {
  JsFileInfo,
  JsHeaderInfo,
  JsKdfParams,
  JsMetadata,
  getFileInfo,
  isKdbxFile,
} from "./kdbx_wasm.js";
