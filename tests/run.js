// tests/run.js  —  npm test
// Basic smoke tests using only Node built-ins — no test framework needed.
// Tests: schema creation, seed data, query helpers, checkout transaction.

process.env.DATABASE_PATH = ':memory:'; // use in-memory DB for tests

const assert = require('assert');
const bcrypt = require('bcryptjs');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${err.message}`);
    failed++;
  }
}

console.log('\n🧪  Duka POS — Test Suite\n');

// ── DB / schema ────────────────────────────────────────────────────────────
console.log('── Database & Schema');
const db = require('../db/index');

test('database opens without error', () => {
  const result = db.prepare("SELECT 1 AS ok").get();
  assert.strictEqual(result.ok, 1);
});

test('all tables created', () => {
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ).all().map(r => r.name);
  ['products','sale_items','sales','shops','users'].forEach(t =>
    assert(tables.includes(t), `Missing table: ${t}`)
  );
});

test('foreign keys are enforced', () => {
  const fk = db.pragma('foreign_keys');
  assert.strictEqual(fk[0].foreign_keys, 1);
});

// ── Seed & queries ─────────────────────────────────────────────────────────
console.log('\n── Seed & Queries');
const q = require('../db/queries');

// Insert a test shop + users + products in memory
const shopId = db.prepare("INSERT INTO shops (name) VALUES (?)").run("Test Shop").lastInsertRowid;

const pinHash = bcrypt.hashSync('9999', 10);
const ownerId = db.prepare(
  "INSERT INTO users (shop_id, name, pin_hash, role) VALUES (?, ?, ?, ?)"
).run(shopId, 'testowner', pinHash, 'owner').lastInsertRowid;

db.prepare(
  "INSERT INTO users (shop_id, name, pin_hash, role) VALUES (?, ?, ?, ?)"
).run(shopId, 'testcashier', bcrypt.hashSync('0000', 10), 'cashier');

const productId = db.prepare(
  "INSERT INTO products (shop_id, name, price, stock, barcode) VALUES (?, ?, ?, ?, ?)"
).run(shopId, 'Test Sugar', 180, 10, 'TEST123').lastInsertRowid;

test('getUserByName returns correct user', () => {
  const user = q.getUserByName.get('testowner');
  assert(user, 'User not found');
  assert.strictEqual(user.role, 'owner');
});

test('getUserByName is case-insensitive', () => {
  const user = q.getUserByName.get('TESTOWNER');
  assert(user, 'Case-insensitive lookup failed');
});

test('getProducts returns products for shop', () => {
  const products = q.getProducts.all(shopId);
  assert(products.length >= 1, 'No products returned');
  assert(products.some(p => p.name === 'Test Sugar'), 'Test product not found');
});

test('getProductByBarcode works', () => {
  const p = q.getProductByBarcode.get('TEST123', shopId);
  assert(p, 'Product not found by barcode');
  assert.strictEqual(p.name, 'Test Sugar');
});

test('getProductByBarcode returns null for wrong shop', () => {
  const other = db.prepare("INSERT INTO shops (name) VALUES (?)").run("Other").lastInsertRowid;
  const p = q.getProductByBarcode.get('TEST123', other);
  assert.strictEqual(p, undefined, 'Should not return product from another shop');
});

test('getLowStockProducts respects threshold', () => {
  // Set stock to 3 (below default threshold of 5)
  db.prepare("UPDATE products SET stock = 3, low_stock_threshold = 5 WHERE id = ?").run(productId);
  const low = q.getLowStockProducts.all(shopId);
  assert(low.length >= 1, 'Low stock product not detected');
  db.prepare("UPDATE products SET stock = 10 WHERE id = ?").run(productId);
});

// ── Checkout transaction ────────────────────────────────────────────────────
console.log('\n── Checkout Transaction');

test('processCheckout deducts stock and records sale', () => {
  const before  = q.getProductById.get(productId, shopId).stock;
  const result  = q.processCheckout(shopId, ownerId, [
    { id: productId, name: 'Test Sugar', price: 180, qty: 3 }
  ]);
  const after   = q.getProductById.get(productId, shopId).stock;
  assert.strictEqual(after, before - 3, 'Stock not deducted correctly');
  assert(result.saleId > 0, 'Sale ID not returned');
  assert.strictEqual(result.total, 540, 'Total incorrect');
});

test('processCheckout throws INSUFFICIENT_STOCK', () => {
  let threw = false;
  try {
    q.processCheckout(shopId, ownerId, [
      { id: productId, name: 'Test Sugar', price: 180, qty: 999 }
    ]);
  } catch (e) {
    threw = true;
    assert.strictEqual(e.code, 'INSUFFICIENT_STOCK');
  }
  assert(threw, 'Should have thrown INSUFFICIENT_STOCK');
});

test('processCheckout is atomic — stock unchanged after failure', () => {
  const stockBefore = q.getProductById.get(productId, shopId).stock;
  try {
    q.processCheckout(shopId, ownerId, [
      { id: productId, name: 'Test Sugar', price: 180, qty: 1   },
      { id: 99999,     name: 'Ghost',      price: 50,  qty: 1   }, // nonexistent
    ]);
  } catch (_) {}
  const stockAfter = q.getProductById.get(productId, shopId).stock;
  assert.strictEqual(stockBefore, stockAfter, 'Stock changed despite failed transaction');
});

// ── Validate middleware ──────────────────────────────────────────────────────
console.log('\n── Input Validation');
const { validateCart } = require('../middleware/validate');

test('validateCart rejects empty array', () => {
  assert(validateCart([]) !== null, 'Should reject empty cart');
});
test('validateCart rejects non-array', () => {
  assert(validateCart(null) !== null, 'Should reject null');
});
test('validateCart rejects zero qty', () => {
  assert(validateCart([{ id: 1, name: 'X', price: 100, qty: 0 }]) !== null);
});
test('validateCart rejects negative price', () => {
  assert(validateCart([{ id: 1, name: 'X', price: -1, qty: 1 }]) !== null);
});
test('validateCart accepts valid cart', () => {
  assert.strictEqual(validateCart([{ id: 1, name: 'Sugar', price: 180, qty: 2 }]), null);
});

// ── i18n ────────────────────────────────────────────────────────────────────
console.log('\n── i18n');
const translations = require('../i18n/translations');

test('all translation keys have both en and sw', () => {
  const missing = [];
  for (const [key, val] of Object.entries(translations)) {
    if (!val.en) missing.push(`${key}.en`);
    if (!val.sw) missing.push(`${key}.sw`);
  }
  assert.deepStrictEqual(missing, [], `Missing translations: ${missing.join(', ')}`);
});

test('translation count is reasonable', () => {
  const count = Object.keys(translations).length;
  assert(count >= 30, `Only ${count} translation keys — expected at least 30`);
});

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(40)}`);
console.log(`  Passed: ${passed}   Failed: ${failed}`);
console.log(`${'─'.repeat(40)}\n`);

if (failed > 0) process.exit(1);
