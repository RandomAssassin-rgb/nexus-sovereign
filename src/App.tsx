import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ThemeProvider } from "./components/theme-provider";
import { supabase } from "./lib/supabase";
import Splash from "./screens/Splash";
import PlatformSelect from "./screens/PlatformSelect";
import PartnerVerify from "./screens/PartnerVerify";
import OTPVerify from "./screens/OTPVerify";
import FaceVerification from "./screens/FaceVerification";
import UPILink from "./screens/UPILink";
import MainLayout from "./components/MainLayout";
import Home from "./screens/Home";
import Coverage from "./screens/Coverage";
import Claims from "./screens/Claims";
import Profile from "./screens/Profile";
import ClaimEvidence from "./screens/ClaimEvidence";
import FileClaim from "./screens/FileClaim";
import PayoutSuccess from "./screens/PayoutSuccess";
import Wallet from "./screens/Wallet";
import AdminDashboard from "./screens/AdminDashboard";
import AdminPayouts from "./screens/AdminPayouts";
import AdminTriggers from "./screens/AdminTriggers";
import AdminRisk from "./screens/AdminRisk";
import AdminRiders from "./screens/AdminRiders";
import JEPScreen from "./screens/JEPScreen";
import SignInPlatform from "./screens/SignInPlatform";
import SignInMethod from "./screens/SignInMethod";
import SignInCredentials from "./screens/SignInCredentials";
import SignInPhone from "./screens/SignInPhone";
import MockOAuth from "./screens/MockOAuth";
import AadhaarVerify from "./screens/AadhaarVerify";
import CoveragePlans from "./screens/CoveragePlans";
import AdminAuth from "./screens/AdminAuth";
import { initRealtimeSubscription } from "./lib/payoutStore";

import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  const [session, setSession] = useState<any>(null);
  const [adminSession, setAdminSession] = useState<string | null>(() => localStorage.getItem('admin_id'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check localStorage for a dummy session
    const dummySession = localStorage.getItem('dummy_session');
    if (dummySession) {
      try {
        setSession(JSON.parse(dummySession));
      } catch (e) {
        console.error("Failed to parse session", e);
        localStorage.removeItem('dummy_session');
      }
    }
    setLoading(false);

    // Listen for custom login/logout events
    const handleAuthChange = () => {
      const updatedSession = localStorage.getItem('dummy_session');
      setSession(updatedSession ? JSON.parse(updatedSession) : null);
    };

    window.addEventListener('auth-change', handleAuthChange);

    // Admin session listener
    const handleAdminAuthChange = () => {
      setAdminSession(localStorage.getItem('admin_id'));
    };
    window.addEventListener('admin-auth-change', handleAdminAuthChange);

    return () => {
      window.removeEventListener('auth-change', handleAuthChange);
      window.removeEventListener('admin-auth-change', handleAdminAuthChange);
    };
  }, []);

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Loading...</div>;
  }

  return (
    <ThemeProvider defaultTheme="dark" storageKey="nexus-theme">
      <ErrorBoundary>
        <Router>
          <Routes>
            <Route path="/" element={session ? <Navigate to="/home" replace /> : <Splash />} />
            <Route path="/platform" element={<PlatformSelect />} />
            <Route path="/signin-platform" element={<SignInPlatform />} />
            <Route path="/signin-method" element={<SignInMethod />} />
            <Route path="/signin-credentials" element={<SignInCredentials />} />
            <Route path="/signin-phone" element={<SignInPhone />} />
          <Route path="/mock-oauth" element={<MockOAuth />} />
            <Route path="/verify" element={<PartnerVerify />} />
            <Route path="/otp" element={<OTPVerify />} />
            <Route path="/biometrics" element={<FaceVerification />} />
            <Route path="/aadhaar-verify" element={<AadhaarVerify />} />
            <Route path="/coverage-plans" element={<CoveragePlans />} />
            <Route path="/admin/auth" element={<AdminAuth />} />
            
            {/* Protected Routes */}
            <Route path="/upi" element={session ? <UPILink /> : <Navigate to="/" replace />} />
            
            <Route element={session ? <MainLayout /> : <Navigate to="/" replace />}>
              <Route path="/home" element={<Home />} />
              <Route path="/coverage" element={<Coverage />} />
              <Route path="/claims" element={<Claims />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/wallet" element={<Wallet />} />
            </Route>
            
            <Route path="/file-claim" element={session ? <FileClaim /> : <Navigate to="/" replace />} />
            <Route path="/claim-evidence/:id" element={session ? <ClaimEvidence /> : <Navigate to="/" replace />} />
            <Route path="/claim-evidence" element={session ? <ClaimEvidence /> : <Navigate to="/" replace />} />
            <Route path="/payout-success/:id" element={session ? <PayoutSuccess /> : <Navigate to="/" replace />} />
            <Route path="/payout-success" element={session ? <PayoutSuccess /> : <Navigate to="/" replace />} />
            <Route path="/admin" element={(adminSession || localStorage.getItem('admin_id')) ? <AdminDashboard /> : <Navigate to="/" replace />} />
            <Route path="/admin/dashboard" element={(adminSession || localStorage.getItem('admin_id')) ? <AdminDashboard /> : <Navigate to="/" replace />} />
            <Route path="/admin/payouts" element={(adminSession || localStorage.getItem('admin_id')) ? <AdminPayouts /> : <Navigate to="/" replace />} />
            <Route path="/admin/triggers" element={(adminSession || localStorage.getItem('admin_id')) ? <AdminTriggers /> : <Navigate to="/" replace />} />
            <Route path="/admin/risk" element={(adminSession || localStorage.getItem('admin_id')) ? <AdminRisk /> : <Navigate to="/" replace />} />
            <Route path="/admin/riders" element={(adminSession || localStorage.getItem('admin_id')) ? <AdminRiders /> : <Navigate to="/" replace />} />
            <Route path="/jep/:id" element={session ? <JEPScreen /> : <Navigate to="/" replace />} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </ErrorBoundary>
    </ThemeProvider>
  );
}
