ALTER TABLE public.child_links ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS child_links_parent_deleted_idx ON public.child_links (parent_id, deleted_at);