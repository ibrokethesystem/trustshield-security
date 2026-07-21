
ALTER TABLE public.permission_requests DROP CONSTRAINT permission_requests_kind_check;
ALTER TABLE public.permission_requests ADD CONSTRAINT permission_requests_kind_check
  CHECK (kind = ANY (ARRAY['delete_account'::text, 'remove_extension'::text, 'unblock_site'::text]));
