import React from "react";
import { Outlet, NavLink } from "react-router-dom";
import { Home, Shield, ReceiptText, User, Wallet } from "lucide-react";
import { cn } from "../lib/utils";
import NotificationDrawer from "./NotificationDrawer";

export default function MainLayout() {
  return (
    <div className="nexus-app-stage h-screen overflow-hidden bg-background text-foreground">
      <NotificationDrawer />
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[8%] top-[6%] h-56 w-56 rounded-full bg-primary/10 blur-[110px]" />
        <div className="absolute bottom-[4%] right-[8%] h-72 w-72 rounded-full bg-primary/8 blur-[140px]" />
      </div>
      <main className="nexus-app-content flex-1 overflow-y-auto pb-28">
        <Outlet />
      </main>

      <nav className="nexus-worker-nav">
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
          "flex min-w-[4.5rem] flex-col items-center justify-center gap-1 rounded-[0.95rem] px-3 py-2 text-center transition-all",
          isActive
            ? "bg-primary/12 text-primary shadow-[0_10px_28px_rgba(245,166,35,0.12)]"
            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
        )
      }
    >
      {icon}
      <span className="text-[10px] font-bold tracking-[0.18em]">{label}</span>
    </NavLink>
  );
}
