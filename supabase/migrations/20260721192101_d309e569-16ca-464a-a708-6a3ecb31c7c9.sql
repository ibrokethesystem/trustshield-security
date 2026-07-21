
CREATE OR REPLACE FUNCTION public.list_child_emails_for_parent(_parent_email text)
RETURNS TABLE(child_email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cl.child_email
  FROM public.child_links cl
  JOIN auth.users u ON u.id = cl.parent_id
  WHERE lower(u.email) = lower(trim(_parent_email))
    AND cl.deleted_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.list_child_emails_for_parent(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_child_emails_for_parent(text) TO anon, authenticated;
