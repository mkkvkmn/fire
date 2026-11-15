// Type declaration for the sql.js build with the wasm inlined.
declare module "sql.js/dist/sql-wasm-inline.js" {
  import type { SqlJsConfig, SqlJsStatic } from "sql.js";
  const initSqlJs: (config?: SqlJsConfig) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
