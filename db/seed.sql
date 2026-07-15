-- ============================================================================
--  Optional demo data. Run AFTER schema.sql (dev/testing only — never prod).
--
--  This seeds only a NON-privileged demo affiliate so you can explore the
--  affiliate dashboard. It intentionally does NOT create an admin account:
--  provision admins with `npm run create-admin` (server/src/create-admin.js),
--  which requires an operator-supplied password.
--
--  Demo affiliate:  demo@clicker.co.il / demo1234   (role: affiliate)
--  The password is hashed on the fly with pgcrypto bcrypt (gen_salt('bf')),
--  which produces $2a$ hashes that the Node `bcryptjs` library verifies.
-- ============================================================================

INSERT INTO affiliates (name, email, password_hash, custom_ref_code, role)
VALUES (
    'Demo Affiliate',
    'demo@clicker.co.il',
    crypt('demo1234', gen_salt('bf')),
    'DEMO2024',
    'affiliate'
)
ON CONFLICT (email) DO NOTHING;
