-- =============================================================================
-- Display sharing: per-dashboard share tokens + IP whitelist for screens
-- =============================================================================
-- Adds the plumbing to show dashboards on TVs/kiosks via a long random,
-- unguessable URL (/display/<share_token>).
--
--   1. `dashboards.share_token` — cryptographically random, URL-safe token.
--      One token per dashboard, auto-generated on insert. Can be rotated.
--   2. `display_ip_whitelist` — list of CIDR/IP ranges (admin-managed) that
--      may view display URLs without a Microsoft login. Everyone else must
--      authenticate first.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. dashboards.share_token
-- -----------------------------------------------------------------------------
-- Helper: base64url encoding of a random byte string. Supabase uses
-- pgcrypto, so gen_random_bytes() is available. We strip '+/=' so the token
-- is safe to put in a URL path as-is.
CREATE OR REPLACE FUNCTION gen_share_token()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  raw TEXT;
BEGIN
  raw := encode(gen_random_bytes(32), 'base64');
  RETURN translate(raw, '+/=', '-_');
END;
$$;

ALTER TABLE dashboards
  ADD COLUMN IF NOT EXISTS share_token TEXT;

-- Backfill existing rows
UPDATE dashboards
SET share_token = gen_share_token()
WHERE share_token IS NULL;

-- Now enforce uniqueness + NOT NULL + default
ALTER TABLE dashboards
  ALTER COLUMN share_token SET NOT NULL,
  ALTER COLUMN share_token SET DEFAULT gen_share_token();

CREATE UNIQUE INDEX IF NOT EXISTS dashboards_share_token_key
  ON dashboards(share_token);

-- -----------------------------------------------------------------------------
-- 2. display_ip_whitelist
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS display_ip_whitelist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  -- INET accepts both individual addresses ('10.0.0.5') and CIDR blocks
  -- ('10.0.0.0/24'), and supports IPv4 + IPv6.
  ip_range INET NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_display_ip_whitelist_range
  ON display_ip_whitelist USING GIST (ip_range inet_ops);

ALTER TABLE display_ip_whitelist ENABLE ROW LEVEL SECURITY;

-- Only admins can read / write the whitelist through the normal client.
DROP POLICY IF EXISTS "Admins can manage display ip whitelist"
  ON display_ip_whitelist;
CREATE POLICY "Admins can manage display ip whitelist"
  ON display_ip_whitelist FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
        AND user_profiles.role = 'admin'
    )
  );

-- -----------------------------------------------------------------------------
-- 3. RPC: is_display_ip_allowed(client_ip)
-- -----------------------------------------------------------------------------
-- Returns true if the given IP falls within any whitelist entry. Exposed as
-- SECURITY DEFINER so the display route (anonymous / not-yet-authenticated)
-- can ask the question without exposing the full whitelist.
CREATE OR REPLACE FUNCTION is_display_ip_allowed(client_ip TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM display_ip_whitelist
    WHERE ip_range >>= client_ip::inet
  );
$$;

GRANT EXECUTE ON FUNCTION is_display_ip_allowed(TEXT)
  TO anon, authenticated, service_role;

COMMIT;
