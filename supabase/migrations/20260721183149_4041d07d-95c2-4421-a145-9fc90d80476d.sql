
ALTER TABLE public.child_links ADD COLUMN IF NOT EXISTS label text;

CREATE TABLE IF NOT EXISTS public.permission_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL,
  child_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('delete_account','remove_extension')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_requests TO authenticated;
GRANT ALL ON public.permission_requests TO service_role;

ALTER TABLE public.permission_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Child creates own permission requests" ON public.permission_requests
  FOR INSERT TO authenticated
  WITH CHECK (child_id = auth.uid());

CREATE POLICY "Parent or child views their permission requests" ON public.permission_requests
  FOR SELECT TO authenticated
  USING (child_id = auth.uid() OR parent_id = auth.uid());

CREATE POLICY "Parent updates their permission requests" ON public.permission_requests
  FOR UPDATE TO authenticated
  USING (parent_id = auth.uid()) WITH CHECK (parent_id = auth.uid());

CREATE POLICY "Parent or child deletes their permission requests" ON public.permission_requests
  FOR DELETE TO authenticated
  USING (child_id = auth.uid() OR parent_id = auth.uid());

CREATE INDEX IF NOT EXISTS permission_requests_parent_idx ON public.permission_requests(parent_id, status);
CREATE INDEX IF NOT EXISTS permission_requests_child_idx ON public.permission_requests(child_id, kind, status);

CREATE OR REPLACE FUNCTION public.get_siblings(_child uuid)
RETURNS TABLE(child_id uuid, child_email text, label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cl2.child_id, cl2.child_email, cl2.label
  FROM public.child_links cl1
  JOIN public.child_links cl2 ON cl2.parent_id = cl1.parent_id
  WHERE cl1.child_id = _child
    AND cl1.child_id = auth.uid()
    AND cl1.deleted_at IS NULL
    AND cl2.deleted_at IS NULL
    AND cl2.child_id <> _child;
$$;

REVOKE EXECUTE ON FUNCTION public.get_siblings(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_siblings(uuid) TO authenticated, service_role;
