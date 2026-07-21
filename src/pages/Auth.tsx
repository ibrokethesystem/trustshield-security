import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Shield } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { childEmailFor } from "@/lib/childAuth";

const Auth = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [isChild, setIsChild] = useState(false);
  const [parentEmail, setParentEmail] = useState("");

  useEffect(() => {
    document.title = mode === "signup" ? "Sign up · Trust Shield" : "Sign in · Trust Shield";
  }, [mode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate("/", { replace: true });
    });
  }, [navigate]);

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    // Child mode: parentEmail + password only. Otherwise email + password.
    if (isChild) {
      const pe = parentEmail.trim().toLowerCase();
      if (!pe || !pe.includes("@") || !password) return;
    } else if (!email || !password) {
      return;
    }
    setBusy(true);
    try {
      if (isChild) {
        // Child sign-in only: the account was created by the parent from the dashboard.
        const pe = parentEmail.trim().toLowerCase();
        const derived = await childEmailFor(pe);
        const { error } = await supabase.auth.signInWithPassword({ email: derived, password });
        if (error) {
          throw new Error(
            "That parent email + password combination didn't match. Ask your parent to set up your account from their Trust Shield dashboard (Set up child account)."
          );
        }
        // If the parent soft-deleted this child (recycle bin), block sign-in.
        try {
          const { data: sess } = await supabase.auth.getUser();
          const cid = sess.user?.id;
          if (cid) {
            const { data: link } = await supabase
              .from("child_links")
              .select("deleted_at")
              .eq("child_id", cid)
              .maybeSingle();
            if (link?.deleted_at) {
              await supabase.auth.signOut();
              throw new Error(
                "This child account was deleted by the parent. Ask them to restore it from the Family tab."
              );
            }
          }
        } catch (e) {
          if (e instanceof Error && e.message.startsWith("This child account was deleted")) throw e;
          // Otherwise ignore — don't block sign-in on transient network errors.
        }
        // Seed local role so this device recognizes the child immediately.
        localStorage.setItem("ts_pending_child_signup", pe);
        navigate("/", { replace: true });
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        // Require explicit log in after account creation
        await supabase.auth.signOut();
        toast.success("Account created", { description: "Please log in to continue." });
        setMode("signin");
        setPassword("");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/", { replace: true });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(isChild ? "Child sign-in failed" : mode === "signup" ? "Sign-up failed" : "Log-in failed", {
        description: msg,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (result.error) {
      toast.error("Google sign-in failed", { description: result.error.message });
      setBusy(false);
      return;
    }
    if (result.redirected) return;
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-shield flex items-center justify-center glow-shield mb-3">
            <Shield className="w-7 h-7 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <h1 className="text-2xl font-bold">Trust Shield</h1>
          <p className="text-sm text-muted-foreground">Scam & Hack Detector</p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6">
          <div className="flex gap-2 mb-6 bg-secondary rounded-lg p-1">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "signin" ? "bg-background text-foreground" : "text-muted-foreground"
              }`}
            >
              Log in
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "signup" ? "bg-background text-foreground" : "text-muted-foreground"
              }`}
            >
              Create account
            </button>
          </div>

          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => setIsChild(false)}
              className={`flex-1 py-2 rounded-md text-xs font-medium border transition-colors ${
                !isChild ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
              }`}
            >
              Adult
            </button>
            <button
              type="button"
              onClick={() => setIsChild(true)}
              className={`flex-1 py-2 rounded-md text-xs font-medium border transition-colors ${
                isChild ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"
              }`}
            >
              Child
            </button>
          </div>

          {!isChild && (
          <Button
            onClick={handleGoogle}
            disabled={busy}
            variant="outline"
            className="w-full bg-secondary hover:bg-secondary/80 border-border gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </Button>
          )}
          {!isChild && (
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          )}

          <form onSubmit={handleEmail} className="space-y-4">
            {isChild ? (
              <div>
                <Label htmlFor="parent-email">Parent's email</Label>
                <Input
                  id="parent-email"
                  type="email"
                  value={parentEmail}
                  onChange={(e) => setParentEmail(e.target.value)}
                  required
                  placeholder="parent@example.com"
                  className="bg-secondary border-border"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Ask your parent to set up your account from their dashboard, then sign in here with their email and
                  the password they chose.
                </p>
              </div>
            ) : (
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  className="bg-secondary border-border"
                />
              </div>
            )}
            <div>
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="At least 6 characters"
                className="bg-secondary border-border"
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full bg-gradient-shield hover:opacity-90 glow-shield">
              {busy ? "Please wait…" : isChild ? "Sign in as child" : mode === "signup" ? "Create account" : "Log in"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Protected by Trust Shield · <Link to="/" className="hover:underline">Back home</Link>
        </p>
      </div>
    </div>
  );
};

export default Auth;