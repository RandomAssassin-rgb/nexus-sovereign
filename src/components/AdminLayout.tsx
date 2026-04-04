import React from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import {
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
    <div className="min-h-screen bg-background text-foreground font-sans flex">
      {/* Sidebar */}
      <aside className="w-64 bg-card border-r border-border/50 flex flex-col fixed h-full z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-6">
          <h1
            className="text-2xl font-black text-primary tracking-tight cursor-pointer"
            onClick={() => navigate('/admin/dashboard')}
          >
            NEXUS<span className="text-foreground font-medium">ADMIN</span>
          </h1>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl font-medium transition-all group ${
                  active
                    ? 'bg-primary/10 text-primary font-semibold border-l-4 border-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary border-l-4 border-transparent'
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

        <div className="p-4 border-t border-border/50">
          <button className="flex items-center gap-3 w-full px-4 py-2 text-muted-foreground hover:text-foreground rounded-lg font-medium transition-colors">
            <Settings size={18} /> Settings
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/10 px-8 py-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              Command Overview{' '}
              <ChevronRight className="text-muted-foreground" size={18} />{' '}
              <span className="text-muted-foreground font-medium">
                {pageTitle || 'Bengaluru Core'}
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-4">
            <button className="p-2 text-muted-foreground transition-colors hover:text-zinc-900 hover:bg-secondary rounded-full relative">
              <Bell size={20} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary/100 rounded-full border-2 border-white"></span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 border border-border/50 bg-secondary/50 text-foreground hover:bg-secondary font-semibold rounded-lg shadow-[0_2px_4px_rgba(0,0,0,0.02)] transition-all">
              <Download size={16} /> Export Data
            </button>
            {onSimulateClick && (
              <button
                onClick={onSimulateClick}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold rounded-lg shadow-md shadow-indigo-500/20 transform transition-all active:scale-95"
              >
                <Activity size={18} /> Simulate Outage
              </button>
            )}
          </div>
        </header>

        {/* Page Content */}
        <div className="p-8 space-y-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
