import { motion } from "framer-motion";
import { ArrowLeft, Bell, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { useState } from "react";

const PLATFORMS = [
  {
    id: "blinkit",
    name: "Blinkit / Zepto",
    desc: "Hyperlocal • Highest Protection",
    risk: "HIGH RISK",
    riskColor: "text-destructive",
    riskBg: "bg-destructive/10",
    icon: "🛵",
  },
  {
    id: "swiggy_zomato",
    name: "Swiggy / Zomato",
    desc: "City-wide • Smart Coverage",
    risk: "MID RISK",
    riskColor: "text-emerald-500",
    riskBg: "bg-emerald-500/10",
    icon: "🍽️",
  },
  {
    id: "amazon",
    name: "Amazon / Flipkart",
    desc: "Regional • Essential Cover",
    risk: "LOW RISK",
    riskColor: "text-blue-500",
    riskBg: "bg-blue-500/10",
    icon: "📦",
  },
];

export default function PlatformSelect() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState("blinkit");

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="flex items-center justify-between p-4 border-b border-border/10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-secondary rounded-full">
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary/20 rounded-md flex items-center justify-center">
              <span className="text-primary text-xs font-bold">N</span>
            </div>
            <span className="font-bold tracking-tight">Nexus Sovereign</span>
          </div>
        </div>
        <button className="p-2 hover:bg-secondary rounded-full relative">
          <Bell size={20} />
          <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full" />
        </button>
      </header>

      <main className="flex-1 p-6 flex flex-col">
        <div className="flex justify-center gap-2 mb-8">
          <div className="h-1 w-8 bg-primary rounded-full" />
          <div className="h-1 w-2 bg-secondary rounded-full" />
          <div className="h-1 w-2 bg-secondary rounded-full" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Which platform do you deliver for?
          </h1>
          <p className="text-muted-foreground">
            We'll calibrate your coverage to your specific earning patterns.
          </p>
        </motion.div>

        <div className="space-y-4 flex-1">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p.id)}
              className={cn(
                "w-full flex items-center p-4 rounded-2xl border transition-all text-left relative overflow-hidden",
                selected === p.id
                  ? "border-primary bg-primary/5 shadow-[0_0_20px_rgba(245,166,35,0.1)]"
                  : "border-border/50 bg-card hover:border-border"
              )}
            >
              <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center text-2xl mr-4 shrink-0">
                {p.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-bold text-lg">{p.name}</h3>
                  <span className={cn("text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider", p.riskBg, p.riskColor)}>
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

          <div className="mt-6 p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 flex gap-3">
            <CheckCircle2 className="text-emerald-500 shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-emerald-500 font-semibold">Smart Calibration:</strong> Nexus analyzed 1.2M trips this month to ensure your premium reflects current road conditions.
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            localStorage.setItem("signin_platform", selected);
            navigate("/verify");
          }}
          className="w-full bg-primary text-primary-foreground font-semibold py-4 rounded-xl mt-8 hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25 flex items-center justify-center gap-2"
        >
          Continue
          <ArrowLeft size={18} className="rotate-180" />
        </button>
      </main>
    </div>
  );
}
