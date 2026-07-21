-- Convert is_parent_of to SECURITY INVOKER. Parents can already read their own
-- child_links rows via RLS, so definer privileges are unnecessary.
CREATE OR REPLACE FUNCTION public.is_parent_of(_child uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.child_links
    WHERE parent_id = auth.uid()
      AND child_id = _child
      AND deleted_at IS NULL
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_parent_of(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_parent_of(uuid) TO authenticated, service_role;

-- Tighten permission_requests INSERT: enforce parent linkage strictly via
-- child_links (which only the parent can create), independent of any
-- client-supplied signup metadata.
DROP POLICY IF EXISTS "Child creates own permission requests" ON public.permission_requests;
CREATE POLICY "Child creates own permission requests"
ON public.permission_requests
FOR INSERT
TO authenticated
WITH CHECK (
  child_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.child_links cl
    WHERE cl.child_id = auth.uid()
      AND cl.parent_id = permission_requests.parent_id
      AND cl.deleted_at IS NULL
  )
);