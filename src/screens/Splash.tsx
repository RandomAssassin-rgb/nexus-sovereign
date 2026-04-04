import { motion } from "motion/react";
import { Shield, Lock, Bell, Moon, Sun, ArrowRight, Activity, Users, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../components/theme-provider";

export default function Splash() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-[100px]" />

      <header className="w-full flex items-center justify-between p-4 z-20">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary/20 rounded-full flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <span className="font-bold tracking-tight">Nexus Sovereign</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 hover:bg-secondary rounded-full relative"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
          </button>
          <button className="p-2 hover:bg-secondary rounded-full relative">
            <Bell size={20} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-col items-center justify-center p-6 z-10">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center text-center w-full max-w-sm"
        >
          <div className="w-24 h-24 bg-primary/10 rounded-3xl flex items-center justify-center mb-6 border border-primary/20 shadow-[0_0_40px_rgba(245,166,35,0.2)]">
            <Shield className="w-12 h-12 text-primary" />
          </div>

        <h1 className="text-4xl font-bold tracking-tight mb-2">NEXUS SOVEREIGN</h1>
        <p className="text-primary italic text-lg mb-10 font-serif">The Income Oracle</p>
        
        <p className="text-xl text-muted-foreground mb-12">Your earnings. Protected.</p>

        <div className="w-full space-y-4 mb-12">
          <div className="bg-card border border-border/50 rounded-2xl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-left">
                <p className="text-[10px] text-muted-foreground font-bold tracking-wider uppercase">Sovereign Shield</p>
                <p className="text-sm font-medium">Guardian Protocol Active</p>
              </div>
            </div>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-primary text-xs font-bold">$</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-bold tracking-wider uppercase">Oracle Risk Index</p>
              </div>
              <span className="text-xs font-bold text-primary">0.2% NOMINAL</span>
            </div>
            <div className="h-1 w-full bg-secondary rounded-full overflow-hidden">
              <div className="h-full bg-primary w-[15%]" />
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate("/platform")}
          className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
        >
          Get Started
        </button>

        <p className="mt-6 text-sm text-muted-foreground">
          Already enrolled? <button onClick={() => navigate("/signin-platform")} className="text-primary font-medium">Sign in</button>
        </p>

        <div className="w-full flex items-center justify-center gap-4 mt-8 opacity-60">
          <div className="h-px w-12 bg-border/50"></div>
          <button onClick={() => navigate("/admin/auth")} className="text-[11px] uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 font-semibold">
            Are you an insurer? Admin Access <ArrowRight size={10} />
          </button>
          <div className="h-px w-12 bg-border/50"></div>
        </div>

        <div className="flex items-center gap-6 mt-12 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
          <div className="flex items-center gap-1">
            <Lock size={12} />
            <span>Audit Verified</span>
          </div>
          <div className="flex items-center gap-1">
            <Shield size={12} />
            <span>RBI Regulated</span>
          </div>
        </div>
        </motion.div>
      </div>
    </div>
  );
}
