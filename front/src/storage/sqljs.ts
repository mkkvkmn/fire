// Loads sql.js. The inline build carries the wasm as base64 inside the script, so starting SQLite
// needs no network request (the page's policy has connect-src 'none').
import type { SqlJsStatic } from "sql.js";

let loading: Promise<SqlJsStatic> | null = null;

export function loadSqlJs(): Promise<SqlJsStatic> {
  loading ??= import("sql.js/dist/sql-wasm-inline.js").then((m) => {
    const init = (m as { default: (config?: object) => Promise<SqlJsStatic> }).default;
    return init();
  });
  return loading;
}
