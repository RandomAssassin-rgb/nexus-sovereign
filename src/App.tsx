import { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./components/theme-provider";
import Splash from "./screens/Splash";
import { hydrateWorkerStateFromSupabase } from "./lib/persistedState";
import { restoreSessionBridge } from "./lib/sessionBridge";
import { primePayoutAudio } from "./lib/payoutSound";

const PlatformSelect = lazy(() => import("./screens/PlatformSelect"));
const PartnerVerify = lazy(() => import("./screens/PartnerVerify"));
const OTPVerify = lazy(() => import("./screens/OTPVerify"));
const FaceVerification = lazy(() => import("./screens/FaceVerification"));
const UPILink = lazy(() => import("./screens/UPILink"));
const MainLayout = lazy(() => import("./components/MainLayout"));
const WorkerRuntimeLayer = lazy(() => import("./components/WorkerRuntimeLayer"));
const Home = lazy(() => import("./screens/Home"));
const Coverage = lazy(() => import("./screens/Coverage"));
const Claims = lazy(() => import("./screens/Claims"));
const Profile = lazy(() => import("./screens/Profile"));
const ClaimEvidence = lazy(() => import("./screens/ClaimEvidence"));
const FileClaim = lazy(() => import("./screens/FileClaim"));
const PayoutSuccess = lazy(() => import("./screens/PayoutSuccess"));
const Wallet = lazy(() => import("./screens/Wallet"));
const AdminDashboard = lazy(() => import("./screens/AdminDashboard"));
const AdminPayouts = lazy(() => import("./screens/AdminPayouts"));
const AdminTriggers = lazy(() => import("./screens/AdminTriggers"));
const AdminRisk = lazy(() => import("./screens/AdminRisk"));
const AdminRiders = lazy(() => import("./screens/AdminRiders"));
const AdminPartners = lazy(() => import("./screens/AdminPartners"));
const JEPScreen = lazy(() => import("./screens/JEPScreen"));
const SignInPlatform = lazy(() => import("./screens/SignInPlatform"));
const SignInMethod = lazy(() => import("./screens/SignInMethod"));
const SignInCredentials = lazy(() => import("./screens/SignInCredentials"));
const SignInPhone = lazy(() => import("./screens/SignInPhone"));
const MockOAuth = lazy(() => import("./screens/MockOAuth"));
const AadhaarVerify = lazy(() => import("./screens/AadhaarVerify"));
const Preview = lazy(() => import("./screens/Preview"));
const CoveragePlans = lazy(() => import("./screens/CoveragePlans"));
const AdminAuth = lazy(() => import("./screens/AdminAuth"));
const Tier3Challenge = lazy(() => import("./screens/Tier3Challenge"));
const Inbox = lazy(() => import("./screens/Inbox"));
const TrustPassport = lazy(() => import("./screens/TrustPassport"));

function hasWorkerSession(): boolean {
  try {
    const raw = localStorage.getItem("nexus_session") || localStorage.getItem("dummy_session");
    return Boolean(raw && raw.length > 2);
  } catch {
    return false;
  }
}

function hasAdminSessionSync(): boolean {
  try {
    return Boolean(localStorage.getItem("admin_id"));
  } catch {
    return false;
  }
}

function RouteLoader() {
  return (
    <div className="nexus-app-stage flex min-h-screen items-center justify-center px-6">
      <div className="nexus-panel w-full max-w-md rounded-[1.8rem] p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <div className="h-3 w-3 rounded-full bg-primary animate-pulse-nexus" />
        </div>
        <h1 className="mt-5 text-2xl font-black tracking-tight">Loading secure workspace</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">
          Preparing signal intelligence, policy state, and operator routing.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<any>(() => {
    try {
      const raw = localStorage.getItem("nexus_session") || localStorage.getItem("dummy_session");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [adminSession, setAdminSession] = useState<string | null>(() => {
    try {
      return localStorage.getItem("admin_id");
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const isWorkerAuthed = Boolean(session) || hasWorkerSession();
  const isAdminAuthed = Boolean(adminSession) || hasAdminSessionSync();

  useEffect(() => {
    const bootstrap = async () => {
      primePayoutAudio();

      await restoreSessionBridge().catch(() => undefined);
      hydrateWorkerStateFromSupabase().catch(() => undefined);

      try {
        const storedSession =
          localStorage.getItem("nexus_session") || localStorage.getItem("dummy_session");
        setSession(storedSession ? JSON.parse(storedSession) : null);
        setAdminSession(localStorage.getItem("admin_id"));
      } catch {
        setSession(null);
        setAdminSession(null);
      } finally {
        setLoading(false);
      }
    };

    void bootstrap();

    const handleAuthChange = () => {
      try {
        const updatedSession =
          localStorage.getItem("nexus_session") || localStorage.getItem("dummy_session");
        setSession(updatedSession ? JSON.parse(updatedSession) : null);
      } catch {
        setSession(null);
      }
      hydrateWorkerStateFromSupabase().catch(() => undefined);
    };

    const handleAdminAuthChange = () => {
      try {
        setAdminSession(localStorage.getItem("admin_id"));
      } catch {
        setAdminSession(null);
      }
    };

    window.addEventListener("auth-change", handleAuthChange);
    window.addEventListener("admin-auth-change", handleAdminAuthChange);

    return () => {
      window.removeEventListener("auth-change", handleAuthChange);
      window.removeEventListener("admin-auth-change", handleAdminAuthChange);
    };
  }, []);

  if (loading) {
    return <RouteLoader />;
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="nexus-theme">
      <ErrorBoundary>
        <Router>
          {isWorkerAuthed ? (
            <Suspense fallback={null}>
              <WorkerRuntimeLayer session={session} />
            </Suspense>
          ) : null}

          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route path="/" element={isWorkerAuthed ? <Navigate to="/home" replace /> : <Splash />} />
              <Route path="/platform" element={<PlatformSelect />} />
              <Route path="/signin-platform" element={<SignInPlatform />} />
              <Route path="/signin-method" element={<SignInMethod />} />
              <Route path="/signin-credentials" element={<SignInCredentials />} />
              <Route path="/signin-phone" element={<SignInPhone />} />
              <Route path="/mock-oauth" element={<MockOAuth />} />
              <Route path="/verify" element={<PartnerVerify />} />
              <Route path="/otp" element={<OTPVerify />} />
              <Route path="/preview" element={<Preview />} />
              <Route path="/biometrics" element={<FaceVerification />} />
              <Route path="/aadhaar-verify" element={<AadhaarVerify />} />
              <Route path="/coverage-plans" element={<CoveragePlans />} />
              <Route path="/admin/auth" element={<AdminAuth />} />

              <Route path="/upi" element={isWorkerAuthed ? <UPILink /> : <Navigate to="/" replace />} />

              <Route element={isWorkerAuthed ? <MainLayout /> : <Navigate to="/" replace />}>
                <Route path="/home" element={<Home />} />
                <Route path="/coverage" element={<Coverage />} />
                <Route path="/claims" element={<Claims />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/wallet" element={<Wallet />} />
                <Route path="/trust-passport" element={<TrustPassport />} />
              </Route>

              <Route path="/file-claim" element={isWorkerAuthed ? <FileClaim /> : <Navigate to="/" replace />} />
              <Route
                path="/claim-evidence/:id"
                element={isWorkerAuthed ? <ClaimEvidence /> : <Navigate to="/" replace />}
              />
              <Route path="/claim-evidence" element={isWorkerAuthed ? <ClaimEvidence /> : <Navigate to="/" replace />} />
              <Route
                path="/payout-success/:id"
                element={isWorkerAuthed ? <PayoutSuccess /> : <Navigate to="/" replace />}
              />
              <Route path="/payout-success" element={isWorkerAuthed ? <PayoutSuccess /> : <Navigate to="/" replace />} />

              <Route path="/admin" element={isAdminAuthed ? <AdminDashboard /> : <Navigate to="/" replace />} />
              <Route path="/admin/dashboard" element={isAdminAuthed ? <AdminDashboard /> : <Navigate to="/" replace />} />
              <Route path="/admin/payouts" element={isAdminAuthed ? <AdminPayouts /> : <Navigate to="/" replace />} />
              <Route path="/admin/triggers" element={isAdminAuthed ? <AdminTriggers /> : <Navigate to="/" replace />} />
              <Route path="/admin/risk" element={isAdminAuthed ? <AdminRisk /> : <Navigate to="/" replace />} />
              <Route path="/admin/partners" element={isAdminAuthed ? <AdminPartners /> : <Navigate to="/" replace />} />
              <Route path="/admin/riders" element={isAdminAuthed ? <AdminRiders /> : <Navigate to="/" replace />} />
              <Route path="/jep/:id" element={isWorkerAuthed ? <JEPScreen /> : <Navigate to="/" replace />} />
              <Route
                path="/tier3-challenge"
                element={isWorkerAuthed ? <Tier3Challenge /> : <Navigate to="/" replace />}
              />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
