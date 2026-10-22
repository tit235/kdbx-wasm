import wasmBinary from "./kdbx_wasm_bg.wasm";
export const wasm = wasmBinary;
// Package entry for Node.js and bundlers. Callers must initialize the WASM
// module explicitly with the exported binary:
//
//   import { initSync, wasm as wasmBinary } from "kdbx-wasm";
//   initSync(wasmBinary);
//
// Bundlers that support WebAssembly imports resolve the
// binary through the import above. initAsync is available for fetch-based
// initialization in browser bundles.
export { default as initAsync, initSync } from "./kdbx_wasm.js";
export { KdbxDatabase } from "./database.js";
export {
  JsFileInfo,
  JsHeaderInfo,
  JsKdfParams,
  JsMetadata,
  getFileInfo,
  isKdbxFile,
} from "./kdbx_wasm.js";
