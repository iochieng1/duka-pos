// middleware/auth.js

function requireAuth(req, res, next) {
  if (req.session && req.session.user) return next();
  req.session.returnTo = req.originalUrl;
  return res.redirect("/login");
}

function requireOwner(req, res, next) {
  if (req.session && req.session.user && req.session.user.role === "owner") return next();
  return res.status(403).render("403", { title: "Access Denied" });
}

// Attach user to res.locals for every template
function attachUser(req, res, next) {
  res.locals.user = req.session.user || null;
  next();
}

module.exports = { requireAuth, requireOwner, attachUser };
