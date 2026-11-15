// Project file schema (*.fire.sqlite). The version is PRAGMA user_version; MIGRATIONS[n] takes a
// file from version n to n + 1. A file newer than this app is refused instead of being damaged.

export const APP_ID = 0x46495245; // "FIRE", stored as PRAGMA application_id

const V1 = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE source_profiles (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE user_scripts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE source_files (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  size INTEGER NOT NULL,
  bytes BLOB NOT NULL,
  profile_id TEXT NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE raw_rows (
  tx_id TEXT PRIMARY KEY,
  source_file_id INTEGER NOT NULL REFERENCES source_files(id),
  row_index INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  occurrence INTEGER NOT NULL,
  columns TEXT NOT NULL
);
CREATE INDEX raw_rows_hash ON raw_rows(content_hash);
CREATE INDEX raw_rows_file ON raw_rows(source_file_id);

CREATE TABLE ledger (
  row_id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL,
  date TEXT NOT NULL,
  month TEXT NOT NULL,
  account TEXT NOT NULL,
  description TEXT NOT NULL,
  info TEXT NOT NULL,
  amount_original REAL NOT NULL,
  class TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  source_file TEXT NOT NULL,
  row_type TEXT NOT NULL,
  share REAL NOT NULL,
  amount REAL NOT NULL,
  owner TEXT NOT NULL,
  split INTEGER NOT NULL
);
CREATE INDEX ledger_month ON ledger(month);
CREATE INDEX ledger_tx ON ledger(tx_id);

CREATE TABLE rules (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  account TEXT NOT NULL,
  description TEXT NOT NULL,
  info TEXT NOT NULL,
  amount TEXT NOT NULL,
  class TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL
);

CREATE TABLE fixes (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE splits (
  position INTEGER PRIMARY KEY,
  start TEXT NOT NULL,
  "end" TEXT NOT NULL,
  account TEXT NOT NULL,
  share REAL NOT NULL,
  owner TEXT NOT NULL
);

CREATE TABLE targets (
  position INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  start TEXT NOT NULL,
  "end" TEXT NOT NULL,
  owner TEXT NOT NULL,
  monthly_amount REAL NOT NULL,
  class TEXT NOT NULL,
  category TEXT NOT NULL,
  sub_category TEXT NOT NULL
);

CREATE TABLE duplicate_decisions (
  pair TEXT PRIMARY KEY,
  decision TEXT NOT NULL,
  decided_at TEXT NOT NULL
);
`;

/** SQL that creates schema version index + 1 from version index. */
export const MIGRATIONS: string[] = [V1];

export const SCHEMA_VERSION = MIGRATIONS.length;
