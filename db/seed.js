// db/seed.js  —  npm run seed
// Seeds two shops with realistic Kenyan product data.
// Safe to re-run: skips rows that already exist.

const bcrypt = require("bcryptjs");
const db     = require("./index");

// ── Helpers ────────────────────────────────────────────────────────────────
const HASH_ROUNDS = 10;
const hash = (pin) => bcrypt.hashSync(pin, HASH_ROUNDS);

// ── Shops ──────────────────────────────────────────────────────────────────
let shopIds = db.prepare("SELECT id FROM shops ORDER BY id").all().map(r => r.id);

if (shopIds.length === 0) {
  const ins = db.prepare("INSERT INTO shops (name, address, phone) VALUES (?, ?, ?)");
  const s1  = ins.run("Mama Mboga — Kawangware", "Kawangware, Nairobi", "+254 712 000 001");
  const s2  = ins.run("Duka Mzuri — Eastleigh",  "Eastleigh, Nairobi",  "+254 712 000 002");
  shopIds   = [s1.lastInsertRowid, s2.lastInsertRowid];
  console.log("🏪  Created 2 shops");
} else {
  console.log(`🏪  Using existing ${shopIds.length} shop(s)`);
}

const [shop1, shop2] = shopIds;

// ── Users ──────────────────────────────────────────────────────────────────
const insertUser = db.prepare(
  "INSERT OR IGNORE INTO users (shop_id, name, pin_hash, role) VALUES (?, ?, ?, ?)"
);
const users = [
  { shop_id: shop1, name: "owner",    pin: "1234", role: "owner"   },
  { shop_id: shop1, name: "cashier",  pin: "0000", role: "cashier" },
  { shop_id: shop2, name: "owner2",   pin: "1234", role: "owner"   },
  { shop_id: shop2, name: "cashier2", pin: "0000", role: "cashier" },
];
for (const u of users) insertUser.run(u.shop_id, u.name, hash(u.pin), u.role);
console.log("👤  Users seeded");

// ── Products ───────────────────────────────────────────────────────────────
const insertProduct = db.prepare(
  `INSERT INTO products (shop_id, name, price, stock, low_stock_threshold, barcode, category)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const productExists = db.prepare("SELECT id FROM products WHERE shop_id = ? AND name = ?");

const productsByShop = {
  [shop1]: [
    // name,               price, stock, threshold, barcode,         category
    ["Sugar 1kg",           180,   25,    5,  "6001070000013", "Dry Goods"  ],
    ["Maize Flour 2kg",     210,   18,    5,  "6001070000037", "Dry Goods"  ],
    ["Cooking Oil 1L",      350,   14,    4,  "6001070000020", "Cooking"    ],
    ["Bread",                65,   22,    8,  "6001070000044", "Bakery"     ],
    ["Milk 500ml",           60,    3,    6,  "6001070000051", "Dairy"      ],
    ["Eggs (tray 30)",      480,    8,    3,  "6001070000058", "Dairy"      ],
    ["Royco Mchuzi 200g",    90,   30,    8,  "6001070000065", "Spices"     ],
    ["Blue Band 250g",      165,   12,    4,  "6001070000072", "Spreads"    ],
  ],
  [shop2]: [
    ["Rice 2kg",            320,   16,    5,  "6001070000068", "Dry Goods"  ],
    ["Soap Bar (Sunlight)", 55,    40,   10,  "6001070000075", "Household"  ],
    ["Tea Leaves 250g",     140,   20,    6,  "6001070000082", "Beverages"  ],
    ["Matches (box)",        15,   60,   15,  "6001070000099", "Household"  ],
    ["Biscuits (Pack)",      50,   35,   10,  "6001070000106", "Snacks"     ],
    ["Soda 500ml",           60,    2,    8,  "6001070000113", "Beverages"  ],
  ],
};

for (const [shopId, prods] of Object.entries(productsByShop)) {
  for (const [name, price, stock, threshold, barcode, category] of prods) {
    if (!productExists.get(Number(shopId), name)) {
      insertProduct.run(Number(shopId), name, price, stock, threshold, barcode, category);
    }
  }
}
console.log("📦  Products seeded");

// ── Done ───────────────────────────────────────────────────────────────────
console.log(`
✅  Seed complete!

  Shop 1 — Mama Mboga (Kawangware)
    Owner:   name=owner    pin=1234
    Cashier: name=cashier  pin=0000

  Shop 2 — Duka Mzuri (Eastleigh)
    Owner:   name=owner2   pin=1234
    Cashier: name=cashier2 pin=0000
`);
