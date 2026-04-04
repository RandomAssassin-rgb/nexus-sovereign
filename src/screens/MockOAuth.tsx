import { motion } from "framer-motion";
import { ShieldCheck, ArrowRight, Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { clearUserSession } from "../lib/payoutStore";

export default function MockOAuth() {
  const [loading, setLoading] = useState(false);
  const [platform, setPlatform] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const p = localStorage.getItem("signin_platform") || "Platform";
    setPlatform(p === "swiggy_zomato" ? "Swiggy / Zomato" : p.charAt(0).toUpperCase() + p.slice(1));
  }, []);

  const handleAuthorize = () => {
    setLoading(true);
    setTimeout(() => {
      const partnerId = `MOCK-${Math.random().toString(36).substring(7).toUpperCase()}`;

      // 1. Try popup communication
      if (window.opener && window.opener !== window) {
        window.opener.postMessage({
          type: 'OAUTH_AUTH_SUCCESS',
          payload: { partnerId }
        }, window.location.origin);
        
        setTimeout(() => window.close(), 100);
      } else {
        // 2. Mobile same-tab fallback
        clearUserSession(); // ← wipe previous user FIRST
        localStorage.setItem("partner_id", partnerId);
        localStorage.setItem("signin_method", "oauth");
        
        const session = {
            user: { id: partnerId, verified: true },
            expiry: new Date(Date.now() + 86400000).toISOString()
        };
        localStorage.setItem("dummy_session", JSON.stringify(session));
        window.dispatchEvent(new Event("auth-change"));

        // Redirect based on query param or default to biometrics
        const nextPath = searchParams.get("next") || "/biometrics";
        navigate(nextPath, { state: { isSignup: true } });
      }
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-slate-900 font-sans">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-8 border border-slate-200"
      >
        <div className="flex justify-between items-start mb-8">
          <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center">
            <Lock className="text-slate-400" size={24} />
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Secure Login</p>
            <p className="text-sm font-semibold">{platform} Authorization</p>
          </div>
        </div>

        <h1 className="text-2xl font-bold mb-4">Allow Genesis Access?</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          Nexus Sovereign (Genesis Engine) is requesting access to your <b>{platform}</b> delivery history and partner profile to verify your income protection eligibility.
        </p>

        <div className="space-y-3 mb-8">
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                <p className="text-xs font-medium">Read access to completed orders (last 6 months)</p>
            </div>
            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                <p className="text-xs font-medium">Verification of Partner ID & Active Status</p>
            </div>
        </div>

        <div className="flex gap-4">
            <button 
                onClick={() => {
                  if (window.opener && window.opener !== window) window.close();
                  else navigate(-1);
                }}
                className="flex-1 py-3 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
                Cancel
            </button>
            <button 
                onClick={handleAuthorize}
                disabled={loading}
                className="flex-2 bg-slate-900 text-white px-8 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50"
            >
                {loading ? "Authorizing..." : "Allow Access"}
                {!loading && <ArrowRight size={16} />}
            </button>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-center gap-2">
            <ShieldCheck size={14} className="text-slate-400" />
            <p className="text-[10px] text-slate-400 font-medium">Verified OAuth 2.0 Connection</p>
        </div>
      </motion.div>
    </div>
  );
}
