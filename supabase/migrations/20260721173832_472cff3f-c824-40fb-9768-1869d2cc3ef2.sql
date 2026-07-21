CREATE OR REPLACE FUNCTION public.is_parent_of(_child uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.child_links
    WHERE parent_id = auth.uid() AND child_id = _child
  );
$function$;