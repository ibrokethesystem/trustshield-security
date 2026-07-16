
CREATE TYPE public.threat_type AS ENUM ('phishing', 'scam', 'hack', 'suspicious_link', 'other');
CREATE TYPE public.threat_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE public.threat_status AS ENUM ('active', 'dismissed', 'blocked');

CREATE TABLE public.threats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  threat_type public.threat_type NOT NULL DEFAULT 'other',
  severity public.threat_severity NOT NULL DEFAULT 'medium',
  source TEXT,
  status public.threat_status NOT NULL DEFAULT 'active',
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.threats TO authenticated;
GRANT ALL ON public.threats TO service_role;

ALTER TABLE public.threats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own threats" ON public.threats
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_threats_updated_at BEFORE UPDATE ON public.threats
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX threats_user_status_idx ON public.threats(user_id, status, created_at DESC);
