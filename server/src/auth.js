// JWT issuing + auth/role middleware.
import jwt from 'jsonwebtoken';
import { config } from './config.js';

/** Create a signed JWT for an affiliate row. */
export function signToken(affiliate) {
  return jwt.sign(
    { sub: affiliate.id, role: affiliate.role, email: affiliate.email },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, algorithm: 'HS256' }
  );
}

/**
 * Reads a bearer token from the Authorization header, verifies it, and
 * attaches { id, role, email } to req.user. Responds 401 when missing/invalid.
 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    req.user = { id: payload.sub, role: payload.role, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Must be used after requireAuth; rejects non-admins with 403. */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}
