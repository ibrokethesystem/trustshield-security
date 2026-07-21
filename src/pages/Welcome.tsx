import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import trustShieldAd from "@/assets/trust-shield-ad.mp4.asset.json";

const Welcome = () => {
  useEffect(() => {
    document.title = "Welcome · Trust Shield";
  }, []);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-shield flex items-center justify-center glow-shield mb-3">
            <Shield className="w-7 h-7 text-primary-foreground" strokeWidth={2.5} />
          </div>
          <h1 className="text-3xl font-bold text-center">Welcome to your new account!</h1>
          <p className="text-sm text-muted-foreground mt-2 text-center">
            Watch this video to sum up what Trust Shield is all about!
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden border border-border bg-black mb-6">
          <video src={trustShieldAd.url} controls playsInline autoPlay className="w-full aspect-video" />
        </div>

        <Button asChild className="w-full bg-gradient-shield hover:opacity-90 glow-shield">
          <Link to="/auth">Continue to log in</Link>
        </Button>
      </div>
    </div>
  );
};

export default Welcome;
