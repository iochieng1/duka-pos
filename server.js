// server.js  —  Duka POS v2.1
// npm run dev  →  starts nodemon
// npm start    →  production
require("dotenv").config();

const express  = require("express");
const session  = require("express-session");
const morgan   = require("morgan");
const flash    = require("connect-flash");
const path     = require("path");
const bcrypt   = require("bcryptjs");

const { requireAuth, requireOwner, attachUser } = require("./middleware/auth");
const { i18n }            = require("./middleware/i18n");
const { validateProduct, validateCart } = require("./middleware/validate");
const q                   = require("./db/queries");

const app  = express();
const PORT = process.env.PORT || 3000;
const isDev = process.env.NODE_ENV !== "production";

// ── View engine ───────────────────────────────────────────────────────────
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// ── Core middleware ───────────────────────────────────────────────────────
app.use(morgan(isDev ? "dev" : "combined"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"), { maxAge: isDev ? 0 : "1d" }));

app.use(session({
  secret:            process.env.SESSION_SECRET || "duka-dev-secret-change-in-production",
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   1000 * 60 * 60 * 8, // 8 hours
    httpOnly: true,
    secure:   !isDev,              // HTTPS only in production
    sameSite: "lax",
  },
}));

app.use(flash());
app.use(attachUser);
app.use(i18n);

// Expose flash messages to every template
app.use((req, res, next) => {
  res.locals.flash = {
    success: req.flash("success"),
    error:   req.flash("error"),
    info:    req.flash("info"),
  };
  next();
});

// ── Language toggle ───────────────────────────────────────────────────────
app.get("/lang/:code", (req, res) => {
  req.session.lang = req.params.code === "sw" ? "sw" : "en";
  res.redirect(req.headers.referer || "/");
});

// ════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════

app.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("login", { title: "Sign In", error: null, prefillName: "", prefillRole: "owner" });
});

app.post("/login", (req, res) => {
  const { name = "", pin = "", role = "owner" } = req.body;

  if (!name.trim() || !pin.trim()) {
    return res.render("login", {
      title: "Sign In",
      error: "Please enter both name and PIN.",
      prefillName: name, prefillRole: role,
    });
  }

  const user = q.getUserByName.get(name.trim());

  if (!user || !bcrypt.compareSync(pin, user.pin_hash)) {
    return res.render("login", {
      title: "Sign In",
      error: "Invalid name or PIN — please try again.",
      prefillName: name, prefillRole: role,
    });
  }

  const shop = q.getShopById.get(user.shop_id);
  req.session.user = { id: user.id, name: user.name, role: user.role, shopId: user.shop_id, shopName: shop.name };

  const returnTo = req.session.returnTo || "/";
  delete req.session.returnTo;
  res.redirect(returnTo);
});

app.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════

app.get("/", requireAuth, (req, res) => {
  const { shopId } = req.session.user;
  const shop       = q.getShopById.get(shopId);
  const products   = q.getProducts.all(shopId);
  const sales      = q.getTodaySales.all(shopId);
  const lowStock   = q.getLowStockProducts.all(shopId);
  const topProducts = q.getTopProducts.all(shopId);

  const totalRevenue = sales.reduce((s, sale) => s + sale.total_amount, 0);

  res.render("dashboard", {
    title: "Dashboard",
    shop, products, sales, lowStock, topProducts,
    totalRevenue, totalSales: sales.length,
  });
});

// ════════════════════════════════════════════════════════════════
// POS
// ════════════════════════════════════════════════════════════════

app.get("/pos", requireAuth, (req, res) => {
  const { shopId }   = req.session.user;
  const products     = q.getProducts.all(shopId);
  const categories   = q.getCategories.all(shopId).map(r => r.category);
  const shop         = q.getShopById.get(shopId);
  res.render("pos", { title: "Checkout", products, categories, shop });
});

// Barcode lookup  —  called by the scanner JS
app.get("/pos/lookup", requireAuth, (req, res) => {
  const code = (req.query.barcode || "").trim();
  if (!code) return res.status(400).json({ error: "No barcode provided." });

  const product = q.getProductByBarcode.get(code, req.session.user.shopId);
  if (!product)  return res.status(404).json({ error: `No product found for barcode "${code}".` });

  res.json(product);
});

// Checkout  —  JSON body: [{ id, name, price, qty }]
app.post("/pos/checkout", requireAuth, (req, res) => {
  const items = req.body;
  const cartError = validateCart(items);
  if (cartError) return res.status(400).json({ error: cartError });

  const { shopId, id: cashierId } = req.session.user;
  const note = (req.query.note || "").slice(0, 200);

  try {
    const result = q.processCheckout(shopId, cashierId, items, note);
    res.json({ sale_id: result.saleId, total: result.total });
  } catch (err) {
    if (err.code === "INSUFFICIENT_STOCK") {
      return res.status(409).json({
        error: `"${err.name}" only has ${err.have} unit(s) left (you requested ${err.need}).`,
      });
    }
    if (err.code === "NOT_FOUND") {
      return res.status(404).json({ error: `Product "${err.name}" not found.` });
    }
    console.error("Checkout error:", err);
    res.status(500).json({ error: "Checkout failed — please try again." });
  }
});

// ════════════════════════════════════════════════════════════════
// INVENTORY  (owner only)
// ════════════════════════════════════════════════════════════════

app.get("/inventory", requireAuth, requireOwner, (req, res) => {
  const { shopId } = req.session.user;
  const products   = q.getProducts.all(shopId);
  const categories = q.getCategories.all(shopId).map(r => r.category);
  res.render("inventory", { title: "Inventory", products, categories });
});

app.post("/inventory/product", requireAuth, requireOwner, validateProduct, (req, res) => {
  const { shopId } = req.session.user;
  const { name, price, stock = 0, low_stock_threshold = 5, barcode = "", category = "General" } = req.body;

  q.insertProduct.run(
    shopId,
    name.trim(),
    Number(price),
    Math.max(0, parseInt(stock, 10) || 0),
    Math.max(1, parseInt(low_stock_threshold, 10) || 5),
    barcode.trim(),
    category.trim() || "General"
  );

  req.flash("success", `✅ "${name.trim()}" added to inventory.`);
  res.redirect("/inventory");
});

app.post("/inventory/restock", requireAuth, requireOwner, (req, res) => {
  const { shopId } = req.session.user;
  let updated = 0;

  const tx = require("./db").transaction(() => {
    for (const [key, value] of Object.entries(req.body)) {
      if (!key.startsWith("qty_")) continue;
      const id  = parseInt(key.replace("qty_", ""), 10);
      const qty = parseInt(value, 10);
      if (id > 0 && qty > 0) {
        q.updateProductStock.run(qty, id, shopId);
        updated++;
      }
    }
  });
  tx();

  req.flash(updated > 0 ? "success" : "info",
    updated > 0 ? `✅ Restocked ${updated} product(s).` : "No quantities entered.");
  res.redirect("/inventory");
});

app.post("/inventory/product/:id/delete", requireAuth, requireOwner, (req, res) => {
  q.deleteProduct.run(req.params.id, req.session.user.shopId);
  req.flash("success", "Product removed.");
  res.redirect("/inventory");
});

// ════════════════════════════════════════════════════════════════
// REPORTS  (owner only)
// ════════════════════════════════════════════════════════════════

app.get("/reports", requireAuth, requireOwner, (req, res) => {
  const { shopId } = req.session.user;
  const summaries  = q.getWeeklyReport.all(shopId);
  const topProducts = q.getTopProducts.all(shopId);
  res.render("reports", { title: "Reports", summaries, topProducts });
});

// CSV download
app.get("/reports/export.csv", requireAuth, requireOwner, (req, res) => {
  const summaries = q.getWeeklyReport.all(req.session.user.shopId);
  const header    = "Date,Transactions,Items Sold,Cashiers Active,Revenue (KSh)\n";
  const rows      = summaries.map(r =>
    `${r.date},${r.total_sales},${r.items_sold},${r.cashiers_active},${Number(r.total_revenue).toFixed(2)}`
  ).join("\n");
  const filename  = `duka-report-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send("\uFEFF" + header + rows + "\n"); // BOM for Excel compatibility
});

// ════════════════════════════════════════════════════════════════
// SHOPS  (owner only)
// ════════════════════════════════════════════════════════════════

app.get("/shops", requireAuth, requireOwner, (req, res) => {
  const currentShop = q.getShopById.get(req.session.user.shopId);
  const ownerShops  = q.getOwnerShops.all(req.session.user.name);
  res.render("shops", { title: "My Shops", shops: ownerShops, currentShop });
});

app.post("/shops/switch", requireAuth, requireOwner, (req, res) => {
  const newShopId = parseInt(req.body.shop_id, 10);

  // Security: verify this owner has a user in the target shop
  const targetUser = require("./db").prepare(
    "SELECT * FROM users WHERE shop_id = ? AND name = ? AND role = 'owner'"
  ).get(newShopId, req.session.user.name);

  if (!targetUser) {
    req.flash("error", "You don't have owner access to that shop.");
    return res.redirect("/shops");
  }

  const shop = q.getShopById.get(newShopId);
  req.session.user = { id: targetUser.id, name: targetUser.name, role: targetUser.role, shopId: newShopId, shopName: shop.name };
  req.flash("success", `Switched to ${shop.name}`);
  res.redirect("/");
});

// ════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ════════════════════════════════════════════════════════════════

app.use((req, res) => {
  res.status(404).render("404", { title: "Not Found" });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).render("500", { title: "Server Error", message: isDev ? err.message : null });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛒  Duka POS v2.1`);
  console.log(`    http://localhost:${PORT}`);
  console.log(`    ${isDev ? "development" : "production"} mode\n`);
  console.log(`    Shop 1 → owner/1234   cashier/0000`);
  console.log(`    Shop 2 → owner2/1234  cashier2/0000\n`);
});
