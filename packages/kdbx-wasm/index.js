// Node.js ESM entry for kdbx-wasm. Loads WASM synchronously, then exports
// wrapped entries. Browsers and bundlers resolve to browser.js and await init:
//
//   import init, { KdbxDatabase } from 'kdbx-wasm';
//   await init();

import { readFileSync } from "node:fs";
import { initSync } from "./kdbx_wasm.js";

initSync({
  module: new WebAssembly.Module(
    readFileSync(new URL("./kdbx_wasm_bg.wasm", import.meta.url)),
  ),
});

export { KdbxDatabase } from "./database.js";

export {
  JsFileInfo,
  JsHeaderInfo,
  JsKdfParams,
  JsMetadata,
  getFileInfo,
  initSync,
  isKdbxFile,
} from "./kdbx_wasm.js";
export { default } from "./kdbx_wasm.js";
