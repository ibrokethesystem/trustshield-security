
-- Drop the recursive sibling policy and its helper
DROP POLICY IF EXISTS "Child sees siblings via same parent" ON public.child_links;
DROP FUNCTION IF EXISTS public.my_parent_ids();

-- Remove the anon-callable parent email lookup (replaced by edge function)
DROP FUNCTION IF EXISTS public.list_child_emails_for_parent(text);

-- Remove the SECURITY DEFINER sibling RPC (replaced by a limited view)
DROP FUNCTION IF EXISTS public.get_siblings(uuid);

-- Service-role-only helper used by the child-signin edge function
CREATE OR REPLACE FUNCTION public.find_parent_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE lower(u.email) = lower(trim(_email))
    AND EXISTS (
      SELECT 1 FROM public.child_links cl
      WHERE cl.parent_id = u.id AND cl.deleted_at IS NULL
    )
  LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.find_parent_id_by_email(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.find_parent_id_by_email(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.find_parent_id_by_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_parent_id_by_email(text) TO service_role;

-- Sibling view: only exposes non-sensitive fields (no email) to the calling child
CREATE OR REPLACE VIEW public.sibling_view
WITH (security_invoker = off) AS
SELECT cl2.child_id AS sibling_id, cl2.label AS sibling_label
FROM public.child_links cl1
JOIN public.child_links cl2 ON cl2.parent_id = cl1.parent_id
WHERE cl1.child_id = auth.uid()
  AND cl1.deleted_at IS NULL
  AND cl2.deleted_at IS NULL
  AND cl2.child_id <> cl1.child_id;
GRANT SELECT ON public.sibling_view TO authenticated;

-- Lock down handle_new_user (trigger-only) to silence definer linter
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

-- Split vault_entries policy so SELECT is disabled when the vault lock is on
DROP POLICY IF EXISTS "Users manage own vault entries" ON public.vault_entries;
CREATE POLICY "Vault insert own"
  ON public.vault_entries FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Vault update own"
  ON public.vault_entries FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Vault delete own"
  ON public.vault_entries FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Vault select own when unlocked"
  ON public.vault_entries FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND NOT EXISTS (
      SELECT 1 FROM public.vault_settings vs
      WHERE vs.user_id = auth.uid() AND vs.lock_enabled = true
    )
  );
