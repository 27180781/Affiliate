// Public (unauthenticated) endpoints:
//   GET /api/config            → JSON config for the tracking script / integrations
//   GET /clicker-affiliate.js  → the tracking script with current settings baked in
//
// Serving the script dynamically lets admins change the cookie-retention days
// centrally (in settings) without re-editing the <script> embed on every site.
import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from '../config.js';
import { getSettings } from '../settings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Local dev: repo-root/tracking (../../../tracking). Container: baked at TRACKING_DIR.
const trackingDir = process.env.TRACKING_DIR
  ? resolve(process.env.TRACKING_DIR)
  : resolve(__dirname, '../../../tracking');

let templateCache = null;
function loadTemplate() {
  if (templateCache == null) {
    templateCache = readFileSync(resolve(trackingDir, 'clicker-affiliate.js'), 'utf8');
  }
  return templateCache;
}

export const publicRouter = Router();

// GET /api/config
publicRouter.get('/api/config', async (_req, res, next) => {
  try {
    const s = await getSettings();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      cookieName: 'clicker_affiliate',
      rootDomain: config.rootDomain,
      cookieDays: s.cookieDays,
      attribution: s.attribution,
    });
  } catch (err) {
    next(err);
  }
});

// GET /clicker-affiliate.js
publicRouter.get('/clicker-affiliate.js', async (req, res, next) => {
  try {
    const s = await getSettings();
    // The click beacon should target the host the script was actually served
    // from (works whether that's the API's own domain or the dashboard host
    // that proxies /api). Prefer an explicit PUBLIC_API_BASE, else derive it.
    const apiBase =
      config.publicApiBase || `${req.protocol}://${req.get('host')}`;
    // Prepend admin-controlled defaults (a site's own window.CLICKER_AFFILIATE
    // override, set before this script, still wins because we only fill blanks).
    const preamble =
      `;(function(){var c=(window.CLICKER_AFFILIATE=window.CLICKER_AFFILIATE||{});` +
      `if(c.days==null)c.days=${Number(s.cookieDays)};` +
      `if(c.rootDomain==null)c.rootDomain=${JSON.stringify(config.rootDomain)};` +
      `if(c.attribution==null)c.attribution=${JSON.stringify(s.attribution)};` +
      `if(c.apiBase==null)c.apiBase=${JSON.stringify(apiBase)};})();\n`;
    res.type('application/javascript');
    res.set('Cache-Control', 'public, max-age=300');
    res.send(preamble + loadTemplate());
  } catch (err) {
    next(err);
  }
});
