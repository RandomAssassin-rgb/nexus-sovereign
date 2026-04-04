import { motion } from "framer-motion";
import { ArrowLeft, Bell, Wallet, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { cn } from "../lib/utils";
import axios from "axios";

export default function UPILink() {
  const navigate = useNavigate();
  const [upiId, setUpiId] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (upiId.includes("@")) {
      setLoading(true);
      try {
        // Simulate Razorpay UPI Autopay setup
        const response = await axios.post('/api/razorpay/create-subscription');
        
        if (response.data && response.data.status === 'created') {
          setIsVerified(true);
          setTimeout(() => {
            navigate("/home");
          }, 1500);
        } else {
          throw new Error("Failed to setup autopay");
        }
      } catch (error) {
        console.error("UPI Link Error:", error);
        alert("Failed to link UPI account. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  };

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
          <div className="h-1 w-2 bg-secondary rounded-full" />
          <div className="h-1 w-2 bg-secondary rounded-full" />
          <div className="h-1 w-8 bg-primary rounded-full" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Wallet className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Link Payout Account
          </h1>
          <p className="text-muted-foreground">
            Where should we send your Sovereign Shield payouts?
          </p>
        </motion.div>

        <div className="space-y-6 flex-1">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">
              UPI ID
            </label>
            <div className="relative">
              <input
                type="text"
                value={upiId}
                onChange={(e) => {
                  setUpiId(e.target.value);
                  setIsVerified(false);
                }}
                placeholder="e.g. 9876543210@ybl"
                className={cn(
                  "w-full bg-card border rounded-xl p-4 text-lg font-mono focus:outline-none transition-all",
                  isVerified ? "border-emerald-500 ring-1 ring-emerald-500" : "border-border/50 focus:border-primary focus:ring-1 focus:ring-primary"
                )}
              />
              {isVerified && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500">
                  <CheckCircle2 size={24} className="fill-emerald-500 text-background" />
                </div>
              )}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-secondary/50 border border-border/50 flex gap-3">
            <CheckCircle2 className="text-primary shrink-0 mt-0.5" size={18} />
            <p className="text-xs text-muted-foreground leading-relaxed">
              We use UPI for instant, zero-fee payouts directly to your bank account when a claim is approved.
            </p>
          </div>
        </div>

        <button
          onClick={handleVerify}
          disabled={!upiId.includes("@") || isVerified || loading}
          className={cn(
            "w-full font-semibold py-4 rounded-xl mt-8 transition-colors shadow-lg disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2",
            isVerified ? "bg-emerald-500 text-white shadow-emerald-500/25" : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/25"
          )}
        >
          {loading ? "Setting up Autopay..." : isVerified ? "Verified!" : "Verify & Link"}
        </button>
      </main>
    </div>
  );
}
