CREATE TABLE public.scan_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  verdict TEXT NOT NULL,
  risk_score INT NOT NULL DEFAULT 0,
  risk_level TEXT,
  summary TEXT,
  snippet TEXT,
  had_image BOOLEAN NOT NULL DEFAULT false,
  threat_id UUID REFERENCES public.threats(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scan_history TO authenticated;
GRANT ALL ON public.scan_history TO service_role;
ALTER TABLE public.scan_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own scan history" ON public.scan_history FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX scan_history_user_created_idx ON public.scan_history(user_id, created_at DESC);