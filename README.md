# Duka POS v2.1

> Point of Sale & Inventory Management for small Kenyan shops.  
> Built with Node.js, Express, EJS, SQLite — no cloud required.

---

## Features

| | Feature | Who |
|---|---|---|
| ✅ | Real session-based login with bcrypt PINs | All |
| ✅ | Cashier vs Owner roles with separate access | All |
| ✅ | One-tap checkout with quantity controls | Cashier + Owner |
| ✅ | Atomic stock deduction — no overselling | Cashier + Owner |
| ✅ | Low-stock alerts (per-product threshold) | Cashier + Owner |
| 📷 | Barcode scanner — camera, no hardware needed | Cashier + Owner |
| 🖨 | Print receipt via browser print dialog | Cashier + Owner |
| 📂 | Category filter on POS and Inventory | Cashier + Owner |
| ⬇ | CSV export of 7-day sales report | Owner |
| 📊 | Top 5 products widget (7-day) | Owner |
| 🇰🇪 | English / Swahili language toggle | All |
| 🏪 | Multiple shops — scoped data + shop switcher | Owner |
| 🧪 | Test suite (`npm test`) | Dev |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy and configure environment
cp .env.example .env          # edit SESSION_SECRET before deploying

# 3. Create database and seed demo data
npm run seed

# 4. Start development server (auto-reloads on save)
npm run dev
```

Open **http://localhost:3000** → redirected to `/login`

---

## Credentials

| Shop | Role | Name | PIN |
|------|------|------|-----|
| Mama Mboga — Kawangware | Owner | `owner` | `1234` |
| Mama Mboga — Kawangware | Cashier | `cashier` | `0000` |
| Duka Mzuri — Eastleigh | Owner | `owner2` | `1234` |
| Duka Mzuri — Eastleigh | Cashier | `cashier2` | `0000` |

---

## Project Structure

```
duka-pos/
├── server.js                  # Express app — all routes, middleware wiring
├── db/
│   ├── index.js               # SQLite schema — opens/creates duka.db
│   ├── queries.js             # All prepared statements (single source of truth)
│   └── seed.js                # Demo shops, users, barcoded products
├── middleware/
│   ├── auth.js                # requireAuth, requireOwner, attachUser
│   ├── i18n.js                # t() translation helper
│   └── validate.js            # validateProduct, validateCart
├── i18n/
│   └── translations.js        # EN / SW dictionary
├── views/
│   ├── login.ejs
│   ├── dashboard.ejs          # Metrics + sales log + top products
│   ├── pos.ejs                # Checkout, category filter, scanner, receipt
│   ├── inventory.ejs          # Stock table, add product, restock
│   ├── reports.ejs            # 7-day report + CSV export
│   ├── shops.ejs              # Multi-shop switcher
│   ├── 403.ejs / 404.ejs / 500.ejs
│   └── partials/
│       ├── head.ejs
│       ├── nav.ejs            # Language toggle + flash messages
│       └── foot.ejs
├── public/
│   ├── css/main.css
│   └── js/app.js
├── tests/
│   └── run.js                 # 20-test suite (no framework, pure Node)
├── .env.example
├── .gitignore
└── package.json
```

---

## How Each Feature Works

### 📷 Barcode Scanner
- Uses **ZXing** loaded from CDN — no install, works in any modern browser
- Tap **Scan Barcode** on the POS page → camera opens → point at barcode
- Calls `GET /pos/lookup?barcode=XXX` — scoped to current shop's products
- Automatically adds the product to the cart

### 🖨 Print Receipt
- After checkout, a receipt modal appears
- Click **Print Receipt** → `window.print()` fires
- `@media print` CSS hides everything except the receipt area

### ⬇ CSV Export
- Owner → Reports → **Export CSV**
- `GET /reports/export.csv` streams a `.csv` with UTF-8 BOM (Excel-compatible)
- Headers: Date, Transactions, Items Sold, Cashiers Active, Revenue (KSh)

### 🇰🇪 Language Toggle
- Click **EN | SW** in the navbar — stored in session
- The `t()` middleware function injects translations into every EJS template

### 🏪 Multiple Shops
- Every table row is scoped by `shop_id`
- Owners at `/shops` can switch between shops they have an owner account in
- Cashiers always stay on their assigned shop

### 📂 Category Filter
- Products have a `category` field (set when adding in Inventory)
- Category tabs appear on both POS and Inventory pages
- Filtering happens client-side with no page reload

---

## Running Tests

```bash
npm test
```

Runs `tests/run.js` against an in-memory SQLite database:
- Schema creation  
- Query helpers  
- Checkout transaction (atomicity, insufficient stock, wrong shop isolation)  
- Input validation  
- i18n completeness

---

## Deployment

**Reset database:**
```bash
rm duka.db && npm run seed
```

**Production start:**
```bash
NODE_ENV=production SESSION_SECRET=your-32-char-secret npm start
```

**Push to GitHub:**
```bash
git remote add origin https://github.com/YOUR_USERNAME/duka-pos.git
git branch -M main
git push -u origin main
```
