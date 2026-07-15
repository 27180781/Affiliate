/*!
 * Clicker Affiliate — global tracking snippet (vanilla JS, no dependencies).
 * ---------------------------------------------------------------------------
 * Paste this inside the <head> of EVERY site/subdomain you want to track
 * (site1.clicker.co.il, totach.caprover.clicker.co.il, pay.clicker.co.il, …).
 *
 *   <script src="https://affiliate.clicker.co.il/clicker-affiliate.js" defer></script>
 *
 * What it does:
 *   1. Reads the `?ref=` parameter from the current URL.
 *   2. If present, writes a first-party cookie `clicker_affiliate=<ref>` on the
 *      ROOT domain (domain=.clicker.co.il) so it is readable across every
 *      subdomain — including pay.clicker.co.il at checkout.
 *      Flags: Secure; SameSite=Lax; Max-Age = 30 days; Path=/.
 *   3. (Optional) fires a lightweight click beacon to the affiliate API.
 *
 * Configuration (all optional) — set BEFORE this script runs:
 *   <script>
 *     window.CLICKER_AFFILIATE = {
 *       cookieName: 'clicker_affiliate',   // cookie name
 *       rootDomain: 'clicker.co.il',       // root domain for the cookie
 *       days: 30,                          // cookie lifetime in days
 *       attribution: 'last',               // 'last' (overwrite) | 'first' (keep)
 *       apiBase: 'https://affiliate.clicker.co.il', // set '' to disable click beacon
 *       param: 'ref'                       // query-string parameter name
 *     };
 *   </script>
 */
(function () {
  'use strict';

  var defaults = {
    cookieName: 'clicker_affiliate',
    rootDomain: 'clicker.co.il',
    days: 30,
    attribution: 'last', // 'last' = a new ref overwrites; 'first' = keep earliest
    apiBase: 'https://affiliate.clicker.co.il',
    param: 'ref'
  };

  var cfg = {};
  var user = window.CLICKER_AFFILIATE || {};
  for (var k in defaults) cfg[k] = user[k] !== undefined ? user[k] : defaults[k];

  function getParam(name) {
    try {
      return new URLSearchParams(window.location.search).get(name);
    } catch (e) {
      // Fallback for very old browsers without URLSearchParams.
      var m = window.location.search.match(new RegExp('[?&]' + name + '=([^&]+)'));
      return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : null;
    }
  }

  function readCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/([.$?*|{}()[\]\\/+^])/g, '\\$1') + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeCookie(name, value) {
    var maxAge = cfg.days * 24 * 60 * 60; // seconds
    // A leading dot makes the cookie valid for the domain AND all subdomains.
    var domainAttr = cfg.rootDomain ? '; domain=.' + cfg.rootDomain : '';
    // `Secure` requires HTTPS. Skip it on plain http:// (e.g. localhost dev)
    // so the cookie still sets while developing.
    var secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      name + '=' + encodeURIComponent(value) +
      '; Max-Age=' + maxAge +
      '; Path=/' +
      domainAttr +
      '; SameSite=Lax' +
      secure;
  }

  // Sanitise: referral codes are letters/digits only, capped in length.
  function sanitizeRef(raw) {
    if (!raw) return null;
    var ref = String(raw).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    return ref.length >= 4 && ref.length <= 32 ? ref : null;
  }

  function sendClickBeacon(ref) {
    if (!cfg.apiBase) return;
    var base = cfg.apiBase.replace(/\/$/, '');
    try {
      // Use an image pixel (a plain GET). Image loads are exempt from CORS and
      // never trigger a preflight, so cross-subdomain click tracking is reliable
      // (unlike a cross-origin JSON POST / sendBeacon, which needs a preflight).
      // Cap URL/referrer so the pixel URL can't exceed proxy URI limits.
      var cap = function (s) { return String(s || '').slice(0, 512); };
      var qs =
        'ref=' + encodeURIComponent(ref) +
        '&u=' + encodeURIComponent(cap(window.location.href)) +
        '&r=' + encodeURIComponent(cap(document.referrer)) +
        '&t=' + Date.now(); // cache-buster
      var img = new Image();
      img.src = base + '/api/track-click?' + qs;
    } catch (e) { /* never break the host page */ }
  }

  try {
    var ref = sanitizeRef(getParam(cfg.param));
    if (!ref) return; // no referral in the URL → nothing to do

    // A click on a referral link is always a real click — record it regardless
    // of the attribution model (clicks measure traffic; the cookie decides the
    // sale). Only the COOKIE write is gated by first- vs last-click.
    sendClickBeacon(ref);

    var existing = readCookie(cfg.cookieName);
    // First-click attribution keeps the earliest ref; last-click overwrites.
    if (cfg.attribution === 'first' && existing) return;

    writeCookie(cfg.cookieName, ref);
  } catch (e) {
    // Tracking must never throw into the host page.
    if (window.console && console.warn) console.warn('[clicker-affiliate]', e);
  }
})();
