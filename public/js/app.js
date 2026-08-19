// public/js/app.js  —  shared utilities loaded on every page
'use strict';

document.addEventListener('DOMContentLoaded', () => {

  // ── Auto-dismiss flash messages after 5s ───────────────────────────────
  document.querySelectorAll('.flash').forEach(el => {
    setTimeout(() => {
      el.style.transition = 'opacity .4s, max-height .4s';
      el.style.opacity    = '0';
      el.style.maxHeight  = '0';
      el.style.overflow   = 'hidden';
      el.style.padding    = '0';
      setTimeout(() => el.remove(), 450);
    }, 5000);
  });

  // ── Confirm dangerous form submissions ─────────────────────────────────
  // Add data-confirm="message" to any form to get a confirm dialog
  document.querySelectorAll('form[data-confirm]').forEach(form => {
    form.addEventListener('submit', e => {
      if (!confirm(form.dataset.confirm)) e.preventDefault();
    });
  });

  // ── Active nav link highlight (already done server-side,
  //    this just adds the current pathname as a body class) ────────────────
  const path = window.location.pathname.slice(1).split('/')[0] || 'dashboard';
  document.body.classList.add(`page-${path}`);

});
