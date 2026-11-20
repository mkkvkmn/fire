-- An old FiRe project file (schema 1, before the category list), as SQL. Made-up data.
-- Read by project/categories.test.ts: the test runs it into an empty database and opens that.
PRAGMA application_id = 1179210309;
PRAGMA user_version = 1;
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO "settings" ("key", "value") VALUES ('defaultOwner', '"oma"');
INSERT INTO "settings" ("key", "value") VALUES ('projectName', '"Vanha projekti"');
INSERT INTO "settings" ("key", "value") VALUES ('lockedThrough', '"2025-01"');
CREATE TABLE source_profiles (
  id TEXT PRIMARY KEY,
  position INTEGER NOT NULL,
  data TEXT NOT NULL
);
INSERT INTO "source_profiles" ("id", "position", "data") VALUES ('pankki', 0, '{"filePattern":"pankki","account":"Käyttötili","encoding":"auto","delimiter":";","skipRows":0,"sheet":"","dateFormats":"%d.%m.%Y","dayFirst":true,"decimalSeparator":",","thousandsSeparator":"","sign":{"kind":"asis"},"columns":{"date":"Päivä","amount":"Summa","description":["Kuvaus"],"info":[]},"concatSeparator":" ","id":"pankki","name":"Pankki"}');
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
INSERT INTO "source_files" ("id", "name", "hash", "size", "bytes", "profile_id", "imported_at") VALUES (1, 'pankki.csv', '947ff6c7e291e577a327ae243c20832d121fbd7ec909dbce96e159c290100054', 161, X'50c3a46976c3a43b53756d6d613b4b75766175730a30352e30312e323032353b2d34322c35303b4b6175707061204573696d65726b6b690a31322e30312e323032353b323530302c30303b50616c6b6b61204f79204573696d65726b6b690a32302e30322e323032353b2d31352c30303b4b616876696c612054657374690a30332e30332e323032353b31322c33303b4f73696e6b6f204573696d65726b6b690a', 'pankki', '2026-11-20T11:28:39.149Z');
CREATE TABLE raw_rows (
  tx_id TEXT PRIMARY KEY,
  source_file_id INTEGER NOT NULL REFERENCES source_files(id),
  row_index INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  occurrence INTEGER NOT NULL,
  columns TEXT NOT NULL
);
INSERT INTO "raw_rows" ("tx_id", "source_file_id", "row_index", "content_hash", "occurrence", "columns") VALUES ('c6add7946ade0d1d1246-1', 1, 0, 'c6add7946ade0d1d1246', 1, '{"Päivä":"05.01.2025","Summa":"-42,50","Kuvaus":"Kauppa Esimerkki"}');
INSERT INTO "raw_rows" ("tx_id", "source_file_id", "row_index", "content_hash", "occurrence", "columns") VALUES ('be0be1695c28826d5877-1', 1, 1, 'be0be1695c28826d5877', 1, '{"Päivä":"12.01.2025","Summa":"2500,00","Kuvaus":"Palkka Oy Esimerkki"}');
INSERT INTO "raw_rows" ("tx_id", "source_file_id", "row_index", "content_hash", "occurrence", "columns") VALUES ('356c0f06b340437afa47-1', 1, 2, '356c0f06b340437afa47', 1, '{"Päivä":"20.02.2025","Summa":"-15,00","Kuvaus":"Kahvila Testi"}');
INSERT INTO "raw_rows" ("tx_id", "source_file_id", "row_index", "content_hash", "occurrence", "columns") VALUES ('132672c95010f197db5c-1', 1, 3, '132672c95010f197db5c', 1, '{"Päivä":"03.03.2025","Summa":"12,30","Kuvaus":"Osinko Esimerkki"}');
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
INSERT INTO "ledger" ("row_id", "tx_id", "date", "month", "account", "description", "info", "amount_original", "class", "category", "sub_category", "rule_id", "source_file", "row_type", "share", "amount", "owner", "split") VALUES ('target:Ruokabudjetti:oma:menot:ruoka::2025-01', '', '2025-01-31', '2025-01', 'Target', 'Ruokabudjetti', '', -300, 'menot', 'ruoka', '', 'Ruokabudjetti', 'targets.csv', 'Target', 1, -300, 'oma', 0);
INSERT INTO "ledger" ("row_id", "tx_id", "date", "month", "account", "description", "info", "amount_original", "class", "category", "sub_category", "rule_id", "source_file", "row_type", "share", "amount", "owner", "split") VALUES ('be0be1695c28826d5877-1', 'be0be1695c28826d5877-1', '2025-01-12', '2025-01', 'Käyttötili', 'Palkka Oy Esimerkki', '', 2500, 'tulot', 'ansiotulot', 'palkka', '2', 'pankki.csv', 'Actual', 1, 2500, 'oma', 0);
INSERT INTO "ledger" ("row_id", "tx_id", "date", "month", "account", "description", "info", "amount_original", "class", "category", "sub_category", "rule_id", "source_file", "row_type", "share", "amount", "owner", "split") VALUES ('c6add7946ade0d1d1246-1', 'c6add7946ade0d1d1246-1', '2025-01-05', '2025-01', 'Käyttötili', 'Kauppa Esimerkki', '', -42.5, 'menot', 'ruoka', 'kauppa', '1', 'pankki.csv', 'Actual', 1, -42.5, 'oma', 0);
INSERT INTO "ledger" ("row_id", "tx_id", "date", "month", "account", "description", "info", "amount_original", "class", "category", "sub_category", "rule_id", "source_file", "row_type", "share", "amount", "owner", "split") VALUES ('356c0f06b340437afa47-1', '356c0f06b340437afa47-1', '2025-02-20', '2025-02', 'Käyttötili', 'Kahvila Testi', '', -15, 'menot', 'kahvilat', '', '1', 'pankki.csv', 'Actual', 1, -15, 'oma', 0);
INSERT INTO "ledger" ("row_id", "tx_id", "date", "month", "account", "description", "info", "amount_original", "class", "category", "sub_category", "rule_id", "source_file", "row_type", "share", "amount", "owner", "split") VALUES ('132672c95010f197db5c-1', '132672c95010f197db5c-1', '2025-03-03', '2025-03', 'Käyttötili', 'Osinko Esimerkki', '', 12.3, 'tulot', 'pääomatulot', 'osinkotulot', '4', 'pankki.csv', 'Actual', 1, 12.3, 'oma', 0);
INSERT INTO "ledger" ("row_id", "tx_id", "date", "month", "account", "description", "info", "amount_original", "class", "category", "sub_category", "rule_id", "source_file", "row_type", "share", "amount", "owner", "split") VALUES ('target:Ruokabudjetti:oma:menot:ruoka::2025-02', '', '2025-02-28', '2025-02', 'Target', 'Ruokabudjetti', '', -300, 'menot', 'ruoka', '', 'Ruokabudjetti', 'targets.csv', 'Target', 1, -300, 'oma', 0);
INSERT INTO "ledger" ("row_id", "tx_id", "date", "month", "account", "description", "info", "amount_original", "class", "category", "sub_category", "rule_id", "source_file", "row_type", "share", "amount", "owner", "split") VALUES ('target:Ruokabudjetti:oma:menot:ruoka::2025-03', '', '2025-03-31', '2025-03', 'Target', 'Ruokabudjetti', '', -300, 'menot', 'ruoka', '', 'Ruokabudjetti', 'targets.csv', 'Target', 1, -300, 'oma', 0);
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
INSERT INTO "rules" ("id", "position", "account", "description", "info", "amount", "class", "category", "sub_category") VALUES ('1', 0, '', 'kauppa', '', 'any', 'menot', 'ruoka', 'kauppa');
INSERT INTO "rules" ("id", "position", "account", "description", "info", "amount", "class", "category", "sub_category") VALUES ('2', 1, '', 'palkka', '', 'any', 'tulot', 'ansiotulot', 'palkka');
INSERT INTO "rules" ("id", "position", "account", "description", "info", "amount", "class", "category", "sub_category") VALUES ('3', 2, '', 'kahvila', '', 'any', 'menot', 'ravintolat', '');
INSERT INTO "rules" ("id", "position", "account", "description", "info", "amount", "class", "category", "sub_category") VALUES ('4', 3, '', 'osinko', '', 'any', 'tulot', 'pääomatulot', 'osinkotulot');
CREATE TABLE fixes (
  id TEXT PRIMARY KEY,
  tx_id TEXT NOT NULL,
  data TEXT NOT NULL
);
INSERT INTO "fixes" ("id", "tx_id", "data") VALUES ('1', '356c0f06b340437afa47-1', '{"id":"1","txId":"356c0f06b340437afa47-1","category":"kahvilat"}');
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
INSERT INTO "targets" ("position", "name", "start", "end", "owner", "monthly_amount", "class", "category", "sub_category") VALUES (0, 'Ruokabudjetti', '2025-01-01', '2025-03-31', 'oma', -300, 'menot', 'ruoka', '');
CREATE TABLE duplicate_decisions (
  pair TEXT PRIMARY KEY,
  decision TEXT NOT NULL,
  decided_at TEXT NOT NULL
);
CREATE INDEX raw_rows_hash ON raw_rows(content_hash);
CREATE INDEX raw_rows_file ON raw_rows(source_file_id);
CREATE INDEX ledger_month ON ledger(month);
CREATE INDEX ledger_tx ON ledger(tx_id);
