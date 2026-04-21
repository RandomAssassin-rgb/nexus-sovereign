import React from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import SystemIntegrityStatus from './SystemIntegrityStatus';
import {
  Building2,
  LayoutDashboard,
  Send,
  AlertTriangle,
  Shield,
  Users,
  Settings,
  Bell,
  ChevronRight,
  Download,
  Activity,
} from 'lucide-react';

interface AdminLayoutProps {
  children?: React.ReactNode;
  /** If provided, renders "Simulate Outage" button in the header */
  onSimulateClick?: () => void;
  /** Page title shown in header after "Command Overview >" */
  pageTitle?: string;
}

const NAV_ITEMS = [
  { path: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/payouts', label: 'Payouts', icon: Send },
  { path: '/admin/triggers', label: 'Triggers', icon: AlertTriangle, hoverIcon: 'group-hover:text-amber-500' },
  { path: '/admin/risk', label: 'Risk & Fraud', icon: Shield },
  { path: '/admin/partners', label: 'Partners', icon: Building2 },
  { path: '/admin/riders', label: 'Riders', icon: Users },
];

export default function AdminLayout({ children, onSimulateClick, pageTitle }: AdminLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/admin/dashboard') {
      return location.pathname === '/admin' || location.pathname === '/admin/dashboard';
    }
    return location.pathname === path;
  };

  return (
    <div className="nexus-app-stage min-h-screen bg-background text-foreground font-sans">
      <div className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute left-[6%] top-[8%] h-72 w-72 rounded-full bg-primary/10 blur-[140px]" />
        <div className="absolute bottom-[8%] right-[8%] h-80 w-80 rounded-full bg-primary/8 blur-[150px]" />
      </div>
      <div className="nexus-app-content flex min-h-screen">
      {/* Sidebar */}
      <aside className="fixed z-20 flex h-full w-72 flex-col border-r border-border/40 bg-card/75 backdrop-blur-xl shadow-[18px_0_50px_rgba(15,12,9,0.08)] dark:bg-black/45">
        <div className="border-b border-border/40 p-6">
          <h1
            className="cursor-pointer text-2xl font-black tracking-tight text-primary"
            onClick={() => navigate('/admin/dashboard')}
          >
            NEXUS<span className="text-foreground font-medium">ADMIN</span>
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Premium command layer for triggers, claims, risk posture, and reserve discipline.
          </p>
        </div>

        <nav className="flex-1 space-y-2 px-4 py-5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`group flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 font-medium transition-all ${
                  active
                    ? 'border border-primary/25 bg-primary/10 text-primary shadow-[0_16px_34px_rgba(245,166,35,0.10)]'
                    : 'border border-transparent text-muted-foreground hover:border-border/50 hover:bg-secondary/65 hover:text-foreground'
                }`}
              >
                <Icon
                  size={20}
                  className={
                    active
                      ? ''
                      : item.hoverIcon
                      ? `${item.hoverIcon} transition-colors`
                      : ''
                  }
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-border/40 p-4">
          <button className="flex w-full items-center gap-3 rounded-xl border border-border/40 bg-background/40 px-4 py-3 text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground">
            <Settings size={18} /> Settings
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-72 flex min-h-screen flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-6 border-b border-border/30 bg-background/76 px-8 py-5 backdrop-blur-xl">
          <div className="flex items-center gap-4">
            <h2 className="flex items-center gap-2 text-xl font-bold">
              Command Overview{' '}
              <ChevronRight className="text-muted-foreground" size={18} />{' '}
              <span className="text-muted-foreground font-medium">
                {pageTitle || 'Tambaram Core'}
              </span>
            </h2>
            <SystemIntegrityStatus />
          </div>

          <div className="flex items-center gap-4">
            <button className="nexus-icon-button relative text-muted-foreground transition-colors hover:text-foreground">
              <Bell size={20} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary"></span>
            </button>
            <button className="nexus-button-secondary rounded-xl px-4 py-3 text-sm">
              <Download size={16} /> Export Data
            </button>
            {onSimulateClick && (
              <button
                onClick={onSimulateClick}
                className="nexus-button-primary rounded-xl px-5 py-3 text-sm"
              >
                <Activity size={18} /> Simulate Outage
              </button>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="w-full max-w-[118rem] space-y-8 px-8 py-8">
          {children}
        </div>
      </main>
      </div>
    </div>
  );
}
