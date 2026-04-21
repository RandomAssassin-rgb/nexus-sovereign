import { motion } from "framer-motion";
import { ArrowLeft, Bell, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { useState } from "react";
import AuthShell from "../components/AuthShell";

const PLATFORMS = [
  {
    id: "swiggy_zomato",
    name: "Swiggy / Zomato",
    desc: "Food Delivery • City-wide Coverage",
    risk: "MID RISK",
    riskColor: "text-emerald-500",
    riskBg: "bg-emerald-500/10",
    icon: "🍽️",
  },
  {
    id: "blinkit",
    name: "Blinkit / Zepto",
    desc: "10-Min Delivery • Hyperlocal",
    risk: "HIGH RISK",
    riskColor: "text-destructive",
    riskBg: "bg-destructive/10",
    icon: "🛵",
  },
  {
    id: "amazon",
    name: "Amazon / Flipkart",
    desc: "E-commerce • Regional Logistics",
    risk: "LOW RISK",
    riskColor: "text-blue-500",
    riskBg: "bg-blue-500/10",
    icon: "📦",
  },
];

export default function SignInPlatform() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState("swiggy_zomato");

  const handleContinue = () => {
    localStorage.setItem("signin_platform", selected);
    navigate("/signin-method");
  };

  return (
    <AuthShell
      title="Select your platform"
      subtitle="Sign in to your protected account and restore your coverage state."
      onBack={() => navigate("/")}
      step="Sign in"
      progress={0.33}
    >
      <div className="space-y-4">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={cn(
                "w-full flex items-center p-5 rounded-[1.45rem] border transition-all text-left relative overflow-hidden",
                selected === p.id
                  ? "border-primary/30 bg-primary/8 shadow-[0_20px_40px_rgba(245,166,35,0.10)]"
                  : "border-border/50 bg-background/45 hover:border-primary/20 hover:bg-card/70"
              )}
            >
              <div className="mr-4 flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-secondary/70 text-2xl">
                {p.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-lg">{p.name}</h3>
                  <span className={cn("text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-[0.16em]", p.riskBg, p.riskColor)}>
                    {p.risk}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{p.desc}</p>
              </div>
              {selected === p.id && (
                <div className="absolute right-4 bottom-4 text-primary">
                  <CheckCircle2 size={20} className="fill-primary text-background" />
                </div>
              )}
            </button>
          ))}
      </div>

      <button
          onClick={handleContinue}
          className="nexus-button-primary mt-8 w-full"
        >
          Continue to Login
          <ArrowLeft size={18} className="rotate-180" />
      </button>
    </AuthShell>
  );
}
