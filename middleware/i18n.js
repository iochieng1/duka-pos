// middleware/i18n.js
const translations = require("../i18n/translations");

function i18n(req, res, next) {
  const lang = req.session.lang === "sw" ? "sw" : "en";
  res.locals.lang = lang;
  res.locals.t = (key) => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[lang] ?? entry.en ?? key;
  };
  next();
}

module.exports = { i18n };
