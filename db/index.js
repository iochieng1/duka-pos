// db/index.js
// Opens (or creates) the SQLite database and ensures the full schema exists.
// Uses better-sqlite3 — synchronous, no async/await required.

const path     = require("path");
const Database = require("better-sqlite3");

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "duka.db");
const db     = new Database(dbPath);

// Performance & safety pragmas
db.pragma("journal_mode = WAL");   // concurrent reads while writing
db.pragma("foreign_keys = ON");    // enforce FK constraints
db.pragma("synchronous = NORMAL"); // safe + fast

db.exec(`
  /* ── shops ──────────────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS shops (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    address    TEXT    NOT NULL DEFAULT '',
    phone      TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  /* ── users ──────────────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id    INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    pin_hash   TEXT    NOT NULL,
    role       TEXT    NOT NULL CHECK (role IN ('owner','cashier')),
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  /* ── products ───────────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS products (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id    INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    price      REAL    NOT NULL CHECK (price > 0),
    stock      INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    barcode    TEXT    NOT NULL DEFAULT '',
    category   TEXT    NOT NULL DEFAULT 'General',
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  /* ── sales ──────────────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS sales (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    shop_id      INTEGER NOT NULL REFERENCES shops(id)  ON DELETE CASCADE,
    cashier_id   INTEGER NOT NULL REFERENCES users(id),
    total_amount REAL    NOT NULL CHECK (total_amount >= 0),
    note         TEXT    NOT NULL DEFAULT '',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  /* ── sale_items ─────────────────────────────────────────── */
  CREATE TABLE IF NOT EXISTS sale_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id    INTEGER NOT NULL REFERENCES sales(id)    ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    name       TEXT    NOT NULL,
    price      REAL    NOT NULL,
    qty        INTEGER NOT NULL CHECK (qty > 0)
  );

  /* ── indexes ────────────────────────────────────────────── */
  CREATE INDEX IF NOT EXISTS idx_users_shop        ON users(shop_id);
  CREATE INDEX IF NOT EXISTS idx_products_shop     ON products(shop_id);
  CREATE INDEX IF NOT EXISTS idx_products_barcode  ON products(barcode) WHERE barcode != '';
  CREATE INDEX IF NOT EXISTS idx_sales_shop_date   ON sales(shop_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_sale_items_sale   ON sale_items(sale_id);
  CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id);
`);

module.exports = db;
