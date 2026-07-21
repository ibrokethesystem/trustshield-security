
-- is_parent_of must respect soft-deleted links
CREATE OR REPLACE FUNCTION public.is_parent_of(_child uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.child_links
    WHERE parent_id = auth.uid()
      AND child_id = _child
      AND deleted_at IS NULL
  );
$$;

-- Require a real active parent-child link when a child files a permission request
DROP POLICY IF EXISTS "Child creates own permission requests" ON public.permission_requests;
CREATE POLICY "Child creates own permission requests" ON public.permission_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    child_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.child_links cl
      WHERE cl.child_id = auth.uid()
        AND cl.parent_id = permission_requests.parent_id
        AND cl.deleted_at IS NULL
    )
  );
