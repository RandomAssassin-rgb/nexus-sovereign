import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ShieldCheck, Key, Eye, EyeOff, Shield, Lock, AlertCircle, Fingerprint } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "../lib/apiClient";
import { persistSessionBridge } from "../lib/sessionBridge";
import { loadBiometricModels } from "../lib/biometricService";

const passwordRules = (pw: string) => ({
  length: pw.length >= 8,
  upper: /[A-Z]/.test(pw),
  number: /[0-9]/.test(pw),
});

const SHORT_ADMIN_CODE_REGEX = /^NEXUS-(\d{4})$/;
const FULL_ADMIN_CODE_REGEX = /^NEXUS-ADMIN-\d{4}$/;

function normalizeAdminCode(value: string) {
  const trimmed = value.trim().toUpperCase();
  const shortMatch = trimmed.match(SHORT_ADMIN_CODE_REGEX);
  if (shortMatch) {
    return `NEXUS-ADMIN-${shortMatch[1]}`;
  }
  return trimmed;
}

function formatAdminAuthMessage(message: string | undefined, adminCode: string, diagnostic?: string) {
  if (diagnostic) {
    switch (diagnostic) {
      case 'DB_TABLES_MISSING':
        return "Infrastructure Error: Authentication tables are missing. Please contact system admin to run migrations.";
      case 'DB_SCHEMA_MISMATCH':
        return "System Drift: Database schema is out of sync. Infrastructure update required.";
      case 'DB_ACCESS_DENIED':
        return "Security Block: Backend bypass blocked. Database access denied.";
      case 'SUPABASE_CONFIG_INVALID':
        return "Environment Error: Supabase configuration is invalid on the server.";
      case 'AUTH_QUERY_FAILED':
        return "Database Exception: The authentication query failed. Check platform logs.";
    }
  }

  if (!message) return "Server error. Check your connection.";

  const normalized = normalizeAdminCode(adminCode || "");
  if (message === "invalid" || message.includes("not found")) {
    if (!FULL_ADMIN_CODE_REGEX.test(normalized)) {
      return "Use a valid admin code like NEXUS-ADMIN-1244.";
    }
    return `No admin account was found for ${normalized}.`;
  }

  if (message.includes("password") || message === "password wrong") {
    return "The password for this admin account is incorrect.";
  }

  return message;
}

export default function AdminAuth() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"signin" | "signup">("signin");

  // Sign Up state
  const [suCode, setSuCode] = useState("");
  const [suPassword, setSuPassword] = useState("");
  const [suConfirm, setSuConfirm] = useState("");
  const [showSuPw, setShowSuPw] = useState(false);
  const [showSuConf, setShowSuConf] = useState(false);
  const [suError, setSuError] = useState("");
  const [suLoading, setSuLoading] = useState(false);

  // Sign In state
  const [siCode, setSiCode] = useState("");
  const [siPassword, setSiPassword] = useState("");
  const [showSiPw, setShowSiPw] = useState(false);
  const [siError, setSiError] = useState("");
  const [siLoading, setSiLoading] = useState(false);

  useEffect(() => {
    void loadBiometricModels();
  }, []);

  // ─────────────────────────────────────────────────────
  const suRules = passwordRules(suPassword);
  const suPasswordValid = suRules.length && suRules.upper && suRules.number;
  const suPasswordsMatch = suPassword === suConfirm;

  // Diagnostic helper to check if backend is reachable
  const probeServer = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const res = await fetch("/api/system/health", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      }).catch(() => null);

      if (!res?.ok) {
        return false;
      }

      const contentType = res.headers.get("content-type")?.toLowerCase() || "";
      if (!contentType.includes("application/json")) {
        return false;
      }

      const payload = await res.json().catch(() => null);
      return payload?.ok === true;
    } catch (e: any) {
      console.warn("[Diagnostic] Probe failed:", e.message);
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleSignUp = async () => {
    setSuError("");
    const normalizedCode = normalizeAdminCode(suCode);
    if (!normalizedCode) return setSuError("Use a valid admin code like NEXUS-ADMIN-1244.");
    if (!suPasswordValid) return setSuError("Password must be at least 8 characters with 1 uppercase letter and 1 number.");
    if (!suPasswordsMatch) return setSuError("Passwords do not match.");

    setSuLoading(true);
    try {
      const { data } = await apiClient.post("/api/admin/auth/signup", {
        admin_code: normalizedCode,
        password: suPassword,
      });

      if (!data.success) return setSuError(formatAdminAuthMessage(data.message, normalizedCode, data.diagnostic));

      // Success logic
      const session = {
        admin: { id: data.admin.id, role: data.admin.role, code: normalizedCode },
        expires: new Date(Date.now() + 86400000).toISOString()
      };
      await persistSessionBridge({
        admin_id: data.admin.id,
        admin_role: data.admin.role,
        admin_code: normalizedCode,
        nexus_session: JSON.stringify(session)
      }).catch(() => undefined);

      window.dispatchEvent(new Event("admin-auth-change"));

      setTimeout(() => navigate("/biometrics", {
        replace: true,
        state: { isAdmin: true, isSignup: true, adminId: data.admin.id, adminCode: normalizedCode },
      }), 100);
    } catch (err: any) {
      console.error("Signup error:", err);
        const isReachable = await probeServer();
        if (!isReachable) {
          setSuError("Backend Unreachable: start the API server or confirm the Vite /api proxy target is pointing at it.");
        } else {
          setSuError(formatAdminAuthMessage(err.response?.data?.message, normalizedCode));
        }
    } finally {
      setSuLoading(false);
    }
  };

  const handleSignIn = async () => {
    setSiError("");
    const normalizedCode = normalizeAdminCode(siCode);
    if (!normalizedCode) return setSiError("Use a valid admin code like NEXUS-ADMIN-1244.");
    if (!siPassword) return setSiError("password wrong");

    const attemptSignIn = async (isRetry = false): Promise<void> => {
      try {
        const { data } = await apiClient.post("/api/admin/auth/signin", {
          admin_code: normalizedCode,
          password: siPassword,
        });

        if (!data.success) {
          setSiError(formatAdminAuthMessage(data.message, normalizedCode, data.diagnostic));
          return;
        }

        const session = {
          admin: { id: data.admin.id, role: data.admin.role, code: normalizedCode },
          expires: new Date(Date.now() + 86400000).toISOString()
        };
        await persistSessionBridge({
          admin_id: data.admin.id,
          admin_role: data.admin.role,
          admin_code: normalizedCode,
          nexus_session: JSON.stringify(session)
        }).catch(() => undefined);

        window.dispatchEvent(new Event("admin-auth-change"));

        setTimeout(() => navigate("/biometrics", {
          replace: true,
          state: data.admin.face_descriptor
            ? {
                isAdmin: true,
                isSignup: false,
                adminId: data.admin.id,
                adminCode: normalizedCode,
                faceDescriptor: data.admin.face_descriptor,
              }
            : {
                isAdmin: true,
                isSignup: true,
                recoveryMode: true,
                adminId: data.admin.id,
                adminCode: normalizedCode,
              },
        }), 100);
      } catch (err: any) {
        console.error("Signin error:", err);
        if (!isRetry && (!err.response || err.code === "ECONNABORTED")) {
          // Automatic 1-retry fallback
          await new Promise(r => setTimeout(r, 1000));
          return attemptSignIn(true);
        }

        const isReachable = await probeServer();
        if (!isReachable) {
          setSiError("Backend Unreachable: start the API server or confirm the Vite /api proxy target is pointing at it.");
        } else {
          // If server IS reachable, but the request failed, it's likely a logic error or 401/500
          setSiError(formatAdminAuthMessage(err.response?.data?.message || "Internal server error during authentication.", normalizedCode, err.response?.data?.diagnostic));
        }
      }
    };

    setSiLoading(true);
    try {
      await attemptSignIn();
    } finally {
      setSiLoading(false);
    }
  };

  return (
    <div className="nexus-auth-stage overflow-hidden bg-background text-foreground selection:bg-primary/30 font-sans">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />

      <header className="relative z-10 p-6">
        <button
          onClick={() => navigate("/")}
          className="nexus-icon-button rounded-full"
        >
          <ChevronLeft className="w-5 h-5 text-primary" />
        </button>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-6 pb-12">

        {/* Logo */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="w-20 h-20 bg-primary/10 rounded-3xl flex items-center justify-center mb-5 border border-primary/20 shadow-[0_0_40px_rgba(245,166,35,0.2)]"
        >
          <Shield className="w-10 h-10 text-primary" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-6"
        >
          <h1 className="text-3xl font-bold tracking-tight mb-1">NEXUS SOVEREIGN</h1>
          <p className="text-primary italic text-sm font-serif">Admin Command Center</p>
        </motion.div>

        {/* Status bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="nexus-panel mb-6 flex w-full items-center justify-between rounded-2xl p-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground font-bold tracking-wider uppercase">Secure Enclave</p>
              <p className="text-sm font-medium">Restricted Access Portal</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-muted-foreground font-bold tracking-wider uppercase">Live</span>
          </div>
        </motion.div>

        {/* Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="relative mb-5 flex w-full rounded-2xl border border-border/50 bg-card/75 p-1"
        >
          {(["signin", "signup"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setSuError(""); setSiError(""); }}
              className={`flex-1 py-3 px-6 rounded-xl font-semibold text-sm transition-all relative z-10 ${
                activeTab === tab ? "text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
          <motion.div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-primary rounded-xl shadow-lg shadow-primary/25"
            animate={{ left: activeTab === "signin" ? "4px" : "calc(50%)" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          />
        </motion.div>

        <AnimatePresence mode="wait">

          {/* ── SIGN IN ── */}
          {activeTab === "signin" && (
            <motion.div
              key="signin"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <div className="nexus-panel space-y-5 rounded-2xl p-6">

                {/* Admin Code */}
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Admin Code
                  </label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={siCode}
                      onChange={(e) => setSiCode(e.target.value.toUpperCase())}
                      placeholder="NEXUS-ADMIN-0000"
                      className="w-full bg-background border border-border/50 rounded-xl py-4 pl-11 pr-4 text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all font-mono text-sm"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showSiPw ? "text" : "password"}
                      value={siPassword}
                      onChange={(e) => setSiPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full bg-background border border-border/50 rounded-xl py-4 pl-11 pr-12 text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSiPw(!showSiPw)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSiPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {siError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20"
                    >
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                      <p className="text-xs text-destructive font-medium">{siError}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={handleSignIn}
                  disabled={siLoading}
                  className="w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {siLoading ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <Fingerprint className="w-5 h-5" />
                  )}
                  {siLoading ? "Verifying..." : "Sign In"}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── SIGN UP ── */}
          {activeTab === "signup" && (
            <motion.div
              key="signup"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <div className="bg-card border border-border/50 rounded-2xl p-6 space-y-5">

                {/* Admin Code */}
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Admin Invite Code
                  </label>
                  <div className="relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="text"
                      value={suCode}
                      onChange={(e) => setSuCode(e.target.value.toUpperCase())}
                      placeholder="NEXUS-ADMIN-XXXX"
                      className="w-full bg-background border border-border/50 rounded-xl py-4 pl-11 pr-4 text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all font-mono text-sm"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Set Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showSuPw ? "text" : "password"}
                      value={suPassword}
                      onChange={(e) => setSuPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="w-full bg-background border border-border/50 rounded-xl py-4 pl-11 pr-12 text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSuPw(!showSuPw)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSuPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Live password rules */}
                  {suPassword.length > 0 && (
                    <div className="flex gap-3 mt-2 px-1">
                      {[
                        { ok: suRules.length, label: "8+ chars" },
                        { ok: suRules.upper, label: "Uppercase" },
                        { ok: suRules.number, label: "Number" },
                      ].map(({ ok, label }) => (
                        <span
                          key={label}
                          className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${ok ? "text-emerald-500" : "text-muted-foreground/50"}`}
                        >
                          {ok ? "✓" : "·"} {label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type={showSuConf ? "text" : "password"}
                      value={suConfirm}
                      onChange={(e) => setSuConfirm(e.target.value)}
                      placeholder="Repeat your password"
                      className={`w-full bg-background border rounded-xl py-4 pl-11 pr-12 text-foreground placeholder-muted-foreground/50 focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/60 transition-all text-sm ${
                        suConfirm && !suPasswordsMatch ? "border-destructive/50" : "border-border/50"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSuConf(!showSuConf)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showSuConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {suConfirm && !suPasswordsMatch && (
                    <p className="text-[10px] text-destructive font-bold mt-1.5 ml-1">Passwords do not match.</p>
                  )}
                </div>

                {/* Error */}
                <AnimatePresence>
                  {suError && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20"
                    >
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                      <p className="text-xs text-destructive font-medium">{suError}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={handleSignUp}
                  disabled={suLoading}
                  className="w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {suLoading ? (
                    <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <Fingerprint className="w-5 h-5" />
                  )}
                  {suLoading ? "Creating Account..." : "Continue to Face Verification"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <div className="flex items-center gap-6 mt-8 text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
          <div className="flex items-center gap-1"><Lock size={11} /><span>Audit Verified</span></div>
          <div className="flex items-center gap-1"><Shield size={11} /><span>RBI Regulated</span></div>
        </div>
      </main>
    </div>
  );
}
