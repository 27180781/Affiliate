// Provision (or update) an admin account with an operator-supplied password.
// Never ships a default/weak admin password — credentials come from env.
//
//   ADMIN_EMAIL=you@clicker.co.il ADMIN_PASSWORD='<strong>' npm run create-admin
//
// Optional: ADMIN_NAME, ADMIN_REF_CODE.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { pool } from './db.js';

function randomRefSuffix() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(4);
  let s = '';
  for (let i = 0; i < 4; i++) s += alphabet[bytes[i] % alphabet.length];
  return s;
}

async function run() {
  const email = (process.env.ADMIN_EMAIL ?? '').trim();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = (process.env.ADMIN_NAME ?? 'Administrator').trim();
  const refCode = (process.env.ADMIN_REF_CODE ?? 'ADMIN').trim().toUpperCase();

  if (!email || !password) {
    console.error('[create-admin] ADMIN_EMAIL and ADMIN_PASSWORD are required.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('[create-admin] ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  // Upsert by email: create the admin, or reset an existing account to admin
  // with the supplied password. If the desired ref_code is taken by a DIFFERENT
  // account, fall back to a unique variant so provisioning still succeeds.
  let code = refCode;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await pool.query(
        `INSERT INTO affiliates (name, email, password_hash, custom_ref_code, role)
         VALUES ($1, $2, $3, $4, 'admin')
         ON CONFLICT (email)
           DO UPDATE SET password_hash = EXCLUDED.password_hash,
                         name          = EXCLUDED.name,
                         role          = 'admin'`,
        [name, email, hash, code]
      );
      console.log(`[create-admin] admin ready: ${email}`);
      await pool.end();
      return;
    } catch (err) {
      // 23505 on custom_ref_code → the code is used by another account; retry.
      if (err.code === '23505' && String(err.constraint).includes('ref_code')) {
        code = `${refCode}-${randomRefSuffix()}`;
        continue;
      }
      throw err;
    }
  }
  console.error('[create-admin] could not allocate a unique ref code; retry.');
  process.exit(1);
}

run().catch((err) => {
  console.error('[create-admin] failed:', err);
  process.exit(1);
});
