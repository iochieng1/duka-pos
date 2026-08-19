// db/queries.js
// Centralises all prepared statements so server.js stays clean.
// Every query is scoped by shop_id to enforce data isolation.

const db = require("./index");

// ── Auth ───────────────────────────────────────────────────────────────────
const getUserByName = db.prepare("SELECT * FROM users WHERE name = ? COLLATE NOCASE");
const getUserById   = db.prepare("SELECT * FROM users WHERE id = ?");

// ── Products ───────────────────────────────────────────────────────────────
const getProducts = db.prepare(`
  SELECT
    p.*,
    COALESCE((
      SELECT SUM(si.qty)
      FROM   sale_items si
      JOIN   sales s ON s.id = si.sale_id
      WHERE  si.product_id = p.id
        AND  DATE(s.created_at) = DATE('now', 'localtime')
    ), 0) AS sold_today
  FROM products p
  WHERE p.shop_id = ?
  ORDER BY p.category, p.name
`);

const getProductById      = db.prepare("SELECT * FROM products WHERE id = ? AND shop_id = ?");
const getProductByBarcode = db.prepare("SELECT * FROM products WHERE barcode = ? AND shop_id = ? AND barcode != ''");
const getLowStockProducts = db.prepare("SELECT * FROM products WHERE shop_id = ? AND stock <= low_stock_threshold ORDER BY stock");

const insertProduct = db.prepare(`
  INSERT INTO products (shop_id, name, price, stock, low_stock_threshold, barcode, category)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const updateProductStock = db.prepare("UPDATE products SET stock = stock + ?, updated_at = datetime('now') WHERE id = ? AND shop_id = ?");
const deductProductStock = db.prepare(`
  UPDATE products SET stock = stock - ?, updated_at = datetime('now')
  WHERE id = ? AND shop_id = ? AND stock >= ?
`);
const deleteProduct      = db.prepare("DELETE FROM products WHERE id = ? AND shop_id = ?");
const getCategories      = db.prepare("SELECT DISTINCT category FROM products WHERE shop_id = ? ORDER BY category");

// ── Sales ──────────────────────────────────────────────────────────────────
const getTodaySales = db.prepare(`
  SELECT s.*, u.name AS cashier_name
  FROM   sales s
  JOIN   users u ON u.id = s.cashier_id
  WHERE  s.shop_id = ?
    AND  DATE(s.created_at) = DATE('now', 'localtime')
  ORDER  BY s.created_at DESC
`);

const getSaleItems = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?");

const insertSale     = db.prepare("INSERT INTO sales (shop_id, cashier_id, total_amount, note) VALUES (?, ?, ?, ?)");
const insertSaleItem = db.prepare("INSERT INTO sale_items (sale_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)");

const getWeeklyReport = db.prepare(`
  SELECT
    DATE(s.created_at, 'localtime')  AS date,
    COUNT(DISTINCT s.id)              AS total_sales,
    COALESCE(SUM(si.qty),   0)        AS items_sold,
    COALESCE(SUM(s.total_amount), 0)  AS total_revenue,
    COUNT(DISTINCT s.cashier_id)      AS cashiers_active
  FROM   sales s
  LEFT JOIN sale_items si ON si.sale_id = s.id
  WHERE  s.shop_id = ?
    AND  s.created_at >= DATE('now', '-7 days')
  GROUP  BY DATE(s.created_at, 'localtime')
  ORDER  BY date DESC
`);

const getTopProducts = db.prepare(`
  SELECT si.name, SUM(si.qty) AS total_qty, SUM(si.price * si.qty) AS total_revenue
  FROM   sale_items si
  JOIN   sales s ON s.id = si.sale_id
  WHERE  s.shop_id = ?
    AND  s.created_at >= DATE('now', '-7 days')
  GROUP  BY si.name
  ORDER  BY total_qty DESC
  LIMIT  5
`);

// ── Shops ──────────────────────────────────────────────────────────────────
const getShopById    = db.prepare("SELECT * FROM shops WHERE id = ?");
const getAllShops     = db.prepare("SELECT * FROM shops ORDER BY id");
const getOwnerShops  = db.prepare(`
  SELECT s.*, u.name AS login_name, u.id AS user_id
  FROM   shops s
  JOIN   users u ON u.shop_id = s.id
  WHERE  u.name = ? AND u.role = 'owner'
  ORDER  BY s.id
`);
const updateShop = db.prepare("UPDATE shops SET name = ?, address = ?, phone = ? WHERE id = ?");

// ── Checkout transaction ───────────────────────────────────────────────────
function processCheckout(shopId, cashierId, items, note = "") {
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);

  return db.transaction(() => {
    // 1. Check stock for all items before touching anything
    for (const item of items) {
      const product = getProductById.get(item.id, shopId);
      if (!product)            throw { code: "NOT_FOUND",          name: item.name };
      if (product.stock < item.qty) throw { code: "INSUFFICIENT_STOCK", name: item.name, have: product.stock, need: item.qty };
    }

    // 2. Insert sale
    const { lastInsertRowid: saleId } = insertSale.run(shopId, cashierId, total, note);

    // 3. Insert items + deduct stock
    for (const item of items) {
      insertSaleItem.run(saleId, item.id, item.name, item.price, item.qty);
      deductProductStock.run(item.qty, item.id, shopId, item.qty);
    }

    return { saleId, total };
  })();
}

module.exports = {
  // auth
  getUserByName, getUserById,
  // products
  getProducts, getProductById, getProductByBarcode,
  getLowStockProducts, insertProduct, updateProductStock,
  deleteProduct, getCategories,
  // sales
  getTodaySales, getSaleItems, getWeeklyReport, getTopProducts,
  // shops
  getShopById, getAllShops, getOwnerShops, updateShop,
  // transactions
  processCheckout,
};
