// Register / login routes for affiliates (and admins — same table, role column).
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { query } from '../db.js';
import { signToken } from '../auth.js';

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Generate a URL-safe, human-friendly referral code, e.g. "K7QF2P9M". */
function generateRefCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity
  const bytes = randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[bytes[i] % alphabet.length];
  return code;
}

/** Shape the public representation of an affiliate (never leak password_hash). */
function publicAffiliate(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    custom_ref_code: row.custom_ref_code,
    role: row.role,
    total_earnings: row.total_earnings,
    pending_balance: row.pending_balance,
    created_at: row.created_at,
  };
}

// POST /api/auth/register  { name, email, password, ref_code? }
authRouter.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body ?? {};
    const desiredRef = (req.body?.ref_code ?? '').trim().toUpperCase();

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (desiredRef && !/^[A-Z0-9]{4,32}$/.test(desiredRef)) {
      return res.status(400).json({ error: 'ref_code must be 4-32 letters/digits' });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);

    // Pick a ref code: honour requested one, else generate a unique random one.
    let refCode = desiredRef || generateRefCode();

    // Retry a few times in case of a random collision on the unique index.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { rows } = await query(
          `INSERT INTO affiliates (name, email, password_hash, custom_ref_code)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [String(name).trim(), String(email).trim(), passwordHash, refCode]
        );
        const affiliate = rows[0];
        const token = signToken(affiliate);
        return res.status(201).json({ token, affiliate: publicAffiliate(affiliate) });
      } catch (err) {
        // 23505 = unique_violation
        if (err.code === '23505') {
          if (err.constraint && err.constraint.includes('email')) {
            return res.status(409).json({ error: 'Email already registered' });
          }
          // ref_code collision → regenerate (only if it was auto-generated)
          if (desiredRef) {
            return res.status(409).json({ error: 'That referral code is taken' });
          }
          refCode = generateRefCode();
          continue;
        }
        throw err;
      }
    }
    return res.status(500).json({ error: 'Could not allocate a unique referral code, please retry' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login  { email, password }
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await query('SELECT * FROM affiliates WHERE email = $1', [String(email).trim()]);
    const affiliate = rows[0];

    // Always run a compare (even on miss) to avoid trivial user-enumeration timing.
    const hash = affiliate?.password_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(String(password), hash);

    if (!affiliate || !ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(affiliate);
    return res.json({ token, affiliate: publicAffiliate(affiliate) });
  } catch (err) {
    next(err);
  }
});

export { publicAffiliate };
