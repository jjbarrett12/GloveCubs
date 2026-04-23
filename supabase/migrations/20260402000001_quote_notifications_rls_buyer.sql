-- Restrict quote_notifications so buyers only see their own when using authenticated role.
-- Service role (used by Next.js server) bypasses RLS and is unchanged.

-- Drop the permissive policy that allowed all roles to see all rows
DROP POLICY IF EXISTS admin_all_quote_notifications ON catalogos.quote_notifications;

-- Allow authenticated users to SELECT only notifications where they are the recipient.
-- JWT must contain 'email' claim (e.g. from Supabase Auth or custom JWT).
-- When using service_role from the server, RLS is bypassed and getBuyerNotifications()
-- continues to work with session email from cookies.
CREATE POLICY buyer_select_own_notifications ON catalogos.quote_notifications
  FOR SELECT
  TO authenticated
  USING (recipient = coalesce((auth.jwt() ->> 'email'), ''));

-- Allow service_role full access (for admin/worker; service role typically bypasses RLS)
CREATE POLICY quote_notifications_service_role ON catalogos.quote_notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON POLICY buyer_select_own_notifications ON catalogos.quote_notifications IS
  'Buyers can only see their own pending notifications (recipient = JWT email).';
