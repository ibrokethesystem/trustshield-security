
-- Add a policy so a signed-in child can view sibling rows (same parent_id).
CREATE POLICY "Child sees siblings via same parent"
ON public.child_links
FOR SELECT
TO authenticated
USING (
  parent_id IN (
    SELECT cl.parent_id
    FROM public.child_links cl
    WHERE cl.child_id = auth.uid()
      AND cl.deleted_at IS NULL
  )
);

-- Convert get_siblings from SECURITY DEFINER to SECURITY INVOKER now that RLS
-- allows the child to read sibling rows directly.
CREATE OR REPLACE FUNCTION public.get_siblings(_child uuid)
RETURNS TABLE(child_id uuid, child_email text, label text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT cl2.child_id, cl2.child_email, cl2.label
  FROM public.child_links cl1
  JOIN public.child_links cl2 ON cl2.parent_id = cl1.parent_id
  WHERE cl1.child_id = _child
    AND cl1.child_id = auth.uid()
    AND cl1.deleted_at IS NULL
    AND cl2.deleted_at IS NULL
    AND cl2.child_id <> _child;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_siblings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_siblings(uuid) TO authenticated;
