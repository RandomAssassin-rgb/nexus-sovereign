import React, { useEffect } from "react";
import { Outlet, NavLink } from "react-router-dom";
import { Home, Shield, ReceiptText, User, Wallet } from "lucide-react";
import { cn } from "../lib/utils";
import NotificationDrawer from "./NotificationDrawer";
import GlobalSimulationPopup from "./GlobalSimulationPopup";
import { initRealtimeSubscription, syncWithServer } from "../lib/payoutStore";

export default function MainLayout() {
  const [partnerId, setPartnerId] = React.useState(() => localStorage.getItem("partner_id"));

  // 1. Sync partnerId with localStorage (in case of login/logout without page refresh)
  useEffect(() => {
    const checkId = () => {
      const current = localStorage.getItem("partner_id");
      if (current !== partnerId) {
        setPartnerId(current);
      }
    };
    const interval = setInterval(checkId, 2000);
    window.addEventListener("storage", checkId);
    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", checkId);
    };
  }, [partnerId]);

  // 2. Core Global Sync Engine
  // This ensures the app is always "hot" and ready to catch a simulation payload
  useEffect(() => {
    if (!partnerId) {
      console.log("⏸️ [MainLayout] Sync engine paused: No partnerId found.");
      return;
    }

    console.log(`🚀 [MainLayout] Global Sync Engine Started for: ${partnerId}`);

    // Initial sync on mount
    syncWithServer(partnerId, "layout-init");

    // Periodic pulse (every 30s) to keep Supabase & LocalStorage in sync
    const serverSyncInterval = setInterval(() => {
      syncWithServer(partnerId, "layout-pulse");
    }, 30000);

    return () => {
      console.log("🛑 [MainLayout] Global Sync Engine Stopped.");
      clearInterval(serverSyncInterval);
    };
  }, [partnerId]);

  // 3. Realtime Subscription (Supabase Realtime)
  useEffect(() => {
    if (!partnerId) return;
    const cleanup = initRealtimeSubscription(partnerId);
    return () => { if (cleanup) cleanup(); };
  }, [partnerId]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <NotificationDrawer />
      <GlobalSimulationPopup />
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border/50 h-16 flex items-center justify-around px-2 z-50">
        <NavItem to="/home" icon={<Home size={20} />} label="HOME" />
        <NavItem to="/coverage" icon={<Shield size={20} />} label="COVERAGE" />
        <NavItem to="/claims" icon={<ReceiptText size={20} />} label="CLAIMS" />
        <NavItem to="/wallet" icon={<Wallet size={20} />} label="WALLET" />
        <NavItem to="/profile" icon={<User size={20} />} label="PROFILE" />
      </nav>
    </div>
  );
}



function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex flex-col items-center justify-center w-16 h-full space-y-1 transition-colors",
          isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
        )
      }
    >
      {icon}
      <span className="text-[10px] font-medium tracking-wider">{label}</span>
    </NavLink>
  );
}
