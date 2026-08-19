// middleware/validate.js
// Lightweight input validation — no external library needed.

function validateProduct(req, res, next) {
  const { name, price, stock, barcode, category } = req.body;
  const errors = [];

  if (!name || name.trim().length < 2)
    errors.push("Product name must be at least 2 characters.");
  if (!price || isNaN(Number(price)) || Number(price) <= 0)
    errors.push("Price must be a positive number.");
  if (stock !== undefined && (isNaN(Number(stock)) || Number(stock) < 0))
    errors.push("Stock must be 0 or more.");

  if (errors.length) {
    req.flash("error", errors.join(" "));
    return res.redirect("/inventory");
  }
  next();
}

function validateCart(items) {
  if (!Array.isArray(items) || items.length === 0)
    return "Cart is empty.";

  for (const item of items) {
    if (!item.id || !Number.isInteger(item.id) || item.id <= 0)
      return "Invalid product in cart.";
    if (!item.price || isNaN(item.price) || item.price <= 0)
      return "Invalid price in cart.";
    if (!item.qty || !Number.isInteger(item.qty) || item.qty <= 0)
      return "Invalid quantity in cart.";
  }
  return null; // no error
}

module.exports = { validateProduct, validateCart };
