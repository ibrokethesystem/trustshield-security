
-- Fix infinite recursion in child_links sibling policy by using a SECURITY DEFINER helper
CREATE OR REPLACE FUNCTION public.my_parent_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT parent_id FROM public.child_links
  WHERE child_id = auth.uid() AND deleted_at IS NULL;
$$;

REVOKE EXECUTE ON FUNCTION public.my_parent_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_parent_ids() TO authenticated;

DROP POLICY IF EXISTS "Child sees siblings via same parent" ON public.child_links;

CREATE POLICY "Child sees siblings via same parent"
ON public.child_links
FOR SELECT
TO authenticated
USING (parent_id IN (SELECT public.my_parent_ids()));
