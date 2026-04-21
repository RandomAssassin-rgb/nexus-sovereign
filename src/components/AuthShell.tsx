import { ArrowLeft, Bell, Shield } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

type AuthShellProps = {
  title: string;
  subtitle: string;
  onBack: () => void;
  step?: string;
  progress?: number;
  brandLabel?: string;
  rightSlot?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

export default function AuthShell({
  title,
  subtitle,
  onBack,
  step,
  progress = 0.34,
  brandLabel = "Nexus Sovereign",
  rightSlot,
  children,
  footer,
}: AuthShellProps) {
  const stops = [0.33, 0.66, 1];

  return (
    <div className="nexus-auth-stage bg-background text-foreground">
      <header className="nexus-page-header nexus-app-content">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="nexus-icon-button">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-[0_0_28px_rgba(245,166,35,0.12)]">
              <Shield className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">{brandLabel}</div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
                Premium protection flow
              </div>
            </div>
          </div>
        </div>

        {rightSlot ?? (
          <div className="nexus-icon-button text-muted-foreground">
            <Bell size={18} />
          </div>
        )}
      </header>

      <main className="nexus-auth-shell">
        <div className="nexus-panel p-6 sm:p-7">
          {step ? (
            <div className="mb-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
                {step}
              </div>
              <div className="mt-3 flex gap-2">
                {stops.map((stop, index) => (
                  <div
                    key={index}
                    className={`h-1.5 rounded-full transition-all ${
                      progress >= stop ? "w-10 bg-primary" : "w-3 bg-secondary"
                    }`}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-black tracking-[-0.04em] sm:text-[2.35rem]">{title}</h1>
            <p className="mt-3 nexus-page-subtitle">{subtitle}</p>
          </motion.div>

          {children}

          {footer ? <div className="mt-6">{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
