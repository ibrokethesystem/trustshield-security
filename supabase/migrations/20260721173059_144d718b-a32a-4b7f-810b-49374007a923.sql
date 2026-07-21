
CREATE TABLE public.child_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid NOT NULL,
  child_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_links TO authenticated;
GRANT ALL ON public.child_links TO service_role;
ALTER TABLE public.child_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parent manages own links" ON public.child_links
  FOR ALL TO authenticated
  USING (auth.uid() = parent_id) WITH CHECK (auth.uid() = parent_id);
CREATE POLICY "Child sees own link" ON public.child_links
  FOR SELECT TO authenticated
  USING (auth.uid() = child_id);

CREATE OR REPLACE FUNCTION public.is_parent_of(_child uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.child_links
    WHERE parent_id = auth.uid() AND child_id = _child
  );
$$;

CREATE TABLE public.child_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  host text NOT NULL,
  url text NOT NULL,
  risk integer NOT NULL DEFAULT 0,
  blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX child_activity_user_time_idx ON public.child_activity(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_activity TO authenticated;
GRANT ALL ON public.child_activity TO service_role;
ALTER TABLE public.child_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Child inserts own activity" ON public.child_activity
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Child reads own activity" ON public.child_activity
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Parent reads child activity" ON public.child_activity
  FOR SELECT TO authenticated
  USING (public.is_parent_of(user_id));
CREATE POLICY "Parent clears child activity" ON public.child_activity
  FOR DELETE TO authenticated
  USING (public.is_parent_of(user_id));

CREATE TABLE public.child_banned_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  host text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, host)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.child_banned_sites TO authenticated;
GRANT ALL ON public.child_banned_sites TO service_role;
ALTER TABLE public.child_banned_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Child reads own bans" ON public.child_banned_sites
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Parent manages child bans" ON public.child_banned_sites
  FOR ALL TO authenticated
  USING (public.is_parent_of(user_id)) WITH CHECK (public.is_parent_of(user_id));
