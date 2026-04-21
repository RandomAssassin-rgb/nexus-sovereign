import { useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  ChevronRight,
  CloudRain,
  Lock,
  Menu,
  Moon,
  Shield,
  Sparkles,
  Sun,
  Wallet,
  Wind,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../components/theme-provider";

const navItems = [
  { label: "Platform", href: "#platform" },
  { label: "Signals", href: "#signals" },
  { label: "Claims", href: "#claims" },
  { label: "Operator", href: "#operator" },
];

const heroStats = [
  { label: "Weekly premium", value: "Rs 29 - Rs 99" },
  { label: "Zero-touch payout", value: "Under 90 sec" },
  { label: "Active signal mesh", value: "Weather + AQI + traffic" },
];

const signalRail: Array<{
  icon: LucideIcon;
  label: string;
  value: string;
  tone: string;
}> = [
  {
    icon: CloudRain,
    label: "Monsoon pressure",
    value: "Escalation watch",
    tone: "text-primary",
  },
  {
    icon: Wind,
    label: "AQI disruption",
    value: "Assisted review band",
    tone: "text-sky-400",
  },
  {
    icon: Activity,
    label: "Traffic strain",
    value: "Reserve stable",
    tone: "text-emerald-500",
  },
];

const platformModules = [
  {
    eyebrow: "Signal intelligence",
    title: "Read hyperlocal disruption before it turns into lost earnings.",
    copy:
      "Live weather, AQI, traffic, and platform context work together so the protection engine reacts to what workers actually face.",
  },
  {
    eyebrow: "Adaptive pricing",
    title: "Keep protection credible with actuarial guardrails.",
    copy:
      "Weekly pricing and payout release stay grounded in trust posture, geography, seasonality, and reserve-aware controls.",
  },
  {
    eyebrow: "Claims automation",
    title: "Move from verified trigger to payout without adding operator drag.",
    copy:
      "High-confidence events can flow toward zero-touch settlement while edge cases remain explainable and reviewable.",
  },
];

const workflowSteps = [
  {
    step: "01",
    title: "Enroll",
    copy:
      "Verify the worker with phone credentials, face match, and platform-linked identity to create a trusted policy profile.",
  },
  {
    step: "02",
    title: "Observe",
    copy:
      "Watch live disruption pressure across weather, pollution, traffic, and platform load in the exact geography where the worker is active.",
  },
  {
    step: "03",
    title: "Release",
    copy:
      "Route claims into zero-touch or assisted flow, then settle against reserve-aware payout logic without losing auditability.",
  },
];

const operatorNotes = [
  {
    title: "Monsoon cluster watch",
    meta: "Koramangala, Bengaluru · 14 workers approaching confidence threshold",
    tone: "text-primary",
  },
  {
    title: "AQI-linked review band",
    meta: "Tambaram, Chennai · Assisted payout posture active",
    tone: "text-sky-400",
  },
  {
    title: "Portfolio reserve posture",
    meta: "Pmax thresholds holding across active worker cohorts",
    tone: "text-emerald-500",
  },
];

export default function Splash() {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="nexus-page-background relative min-h-screen overflow-x-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-6%] top-[-4%] h-64 w-64 rounded-full bg-primary/10 blur-[84px] sm:h-72 sm:w-72 sm:blur-[96px]" />
        <div className="absolute right-[-8%] top-[12%] hidden h-[22rem] w-[22rem] rounded-full bg-primary/8 blur-[110px] lg:block animate-nexus-drift" />
        <div className="absolute bottom-[-8%] left-[38%] hidden h-[22rem] w-[22rem] rounded-full bg-primary/6 blur-[120px] xl:block animate-nexus-aurora" />
        <div className="nexus-aurora-layer nexus-aurora-gold left-[8%] top-[14%] h-[18rem] w-[18rem]" />
        <div className="nexus-aurora-layer nexus-aurora-ember right-[14%] top-[24%] h-[22rem] w-[22rem]" />
        <div className="absolute inset-[-4%] nexus-subtle-grid opacity-[0.75] dark:opacity-[0.9]" />
        <div className="nexus-splash-overlay absolute inset-0" />
      </div>

      <header className="relative z-30 border-b border-border/40 bg-background/88 backdrop-blur-md">
        <div className="mx-auto flex w-full items-center justify-between px-4 py-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 text-left">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/25 bg-primary/12 shadow-[0_0_30px_rgba(245,166,35,0.16)]">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight">Nexus Sovereign</div>
              <div className="text-[12px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Parametric income protection
              </div>
            </div>
          </button>

          <nav className="hidden items-center gap-7 lg:flex">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-full border border-border/60 bg-card/70 p-2.5 transition-colors hover:bg-secondary"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button className="relative rounded-full border border-border/60 bg-card/70 p-2.5 transition-colors hover:bg-secondary">
              <Bell size={18} />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary" />
            </button>
            <button
              onClick={() => navigate("/signin-platform")}
              className="rounded-full border border-border/60 px-5 py-2.5 text-[0.95rem] font-semibold transition-colors hover:bg-secondary"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate("/platform")}
              className="rounded-full bg-primary px-5 py-2.5 text-[0.95rem] font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-colors hover:bg-primary/90"
            >
              Start for free
            </button>
          </div>

          <div className="flex items-center gap-2 lg:hidden">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="rounded-full border border-border/60 bg-card/70 p-2.5 transition-colors hover:bg-secondary"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() => setMenuOpen((value) => !value)}
              className="rounded-full border border-border/60 bg-card/70 p-2.5 transition-colors hover:bg-secondary"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <div className="border-t border-border/40 px-4 py-4 lg:hidden">
            <div className="flex flex-col gap-3">
              {navItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-2xl border border-border/50 bg-card/60 px-4 py-3 text-sm font-medium text-foreground"
                >
                  {item.label}
                </a>
              ))}
              <button
                onClick={() => navigate("/signin-platform")}
                className="rounded-2xl border border-border/60 px-5 py-3.5 text-base font-semibold"
              >
                Sign in
              </button>
              <button
                onClick={() => navigate("/platform")}
                className="rounded-2xl bg-primary px-5 py-3.5 text-base font-semibold text-primary-foreground"
              >
                Start worker onboarding
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <main className="relative z-10">
        <section className="mx-auto flex min-h-[calc(100svh-74px)] w-full flex-col justify-start gap-10 px-4 pb-14 pt-8 sm:gap-12 sm:px-6 sm:pt-10 lg:gap-14 lg:px-8 lg:pb-24 lg:pt-20 xl:px-10 2xl:px-12">
          <div className="grid items-center gap-10 sm:gap-12 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] 2xl:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]">
            <motion.div
              initial={{ opacity: 0, y: 26 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55 }}
              className="max-w-[56rem] xl:pr-10 2xl:pr-14"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.16em] text-primary">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse-nexus" />
                Live protection for gig income
              </div>

              <h1 className="nexus-landing-display mt-6 max-w-[10.5ch] text-[3.45rem] leading-[0.88] font-black tracking-[-0.055em] sm:max-w-none sm:text-[5rem] sm:leading-[0.92] lg:text-[6.2rem] xl:text-[7rem] 2xl:text-[7.6rem]">
                The real-time
                <br />
                income shield
                <br />
                for workers.
              </h1>

              <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-[1.15rem] sm:leading-9">
                Nexus Sovereign combines hyperlocal signal intelligence, adaptive premium logic, verified identity, and zero-touch payout orchestration in one operating surface.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => navigate("/platform")}
                  className="group inline-flex w-full items-center justify-center gap-2 rounded-[1.2rem] bg-primary px-7 py-[1.15rem] text-[0.98rem] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90 sm:w-auto sm:px-8"
                >
                  Start worker onboarding
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
                <button
                  onClick={() => navigate("/admin/auth")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[1.2rem] border border-border/60 bg-card/60 px-7 py-[1.15rem] text-[0.98rem] font-semibold transition-all hover:bg-secondary sm:w-auto sm:px-8"
                >
                  Open operator console
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-[0.95rem] text-muted-foreground">
                <div>
                  Already enrolled?{" "}
                  <button
                    onClick={() => navigate("/signin-platform")}
                    className="font-semibold text-primary transition-colors hover:text-primary/80"
                  >
                    Sign in
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.15em]">
                  <Lock className="h-3.5 w-3.5" />
                  Hyperlocal, solvency-aware, audit ready
                </div>
              </div>

              <div className="mt-10 grid gap-5 border-t border-border/40 pt-6 sm:grid-cols-3">
                {heroStats.map((item) => (
                  <div key={item.label}>
                    <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      {item.label}
                    </div>
                    <div className="mt-3 text-2xl font-black tracking-tight xl:text-[2rem]">{item.value}</div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.08 }}
              className="relative nexus-hero-shell xl:ml-auto xl:min-h-[44rem] xl:w-full xl:max-w-[68rem]"
            >
              <div className="nexus-depth-card nexus-premium-sheen rounded-[2.4rem] p-5 sm:p-6 xl:p-8">
                <div className="nexus-panel-glow rounded-[inherit]" />
                <div className="nexus-panel-scan rounded-[inherit]" />

                <div className="relative flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[12px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Protection control plane
                    </div>
                    <div className="mt-1 text-[2rem] font-bold tracking-tight xl:text-[2.35rem]">Sovereign Shield</div>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2.5 text-[12px] font-bold uppercase tracking-[0.15em] text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Live telemetry
                  </div>
                </div>

                <div className="relative mt-6 grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="nexus-glass-card rounded-[2rem] p-5 sm:p-6">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-[12px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                          Worker posture
                        </div>
                        <div className="mt-2 text-[2rem] font-black tracking-[-0.04em]">
                          0.2% risk index
                        </div>
                      </div>
                      <div className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-500">
                        Stable
                      </div>
                    </div>

                    <div className="mt-5 rounded-[1.6rem] border border-border/45 bg-background/40 p-4 dark:bg-background/20">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                            Weekly premium corridor
                          </div>
                          <div className="mt-2 text-3xl font-black tracking-[-0.04em]">Rs 58</div>
                        </div>
                        <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-right">
                          <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                            Coverage cap
                          </div>
                          <div className="mt-1 text-lg font-bold text-primary">Rs 480</div>
                        </div>
                      </div>
                      <div className="mt-4 h-2 overflow-hidden rounded-full bg-secondary">
                        <div className="h-full w-[18%] rounded-full bg-primary" />
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3">
                      {signalRail.map((item) => {
                        const Icon = item.icon;
                        return (
                          <div
                            key={item.label}
                            className="flex items-center justify-between rounded-[1.3rem] border border-border/40 bg-card/55 px-4 py-3"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                                  {item.label}
                                </div>
                                <div className="mt-1 text-sm font-semibold">{item.value}</div>
                              </div>
                            </div>
                            <div className={`text-[12px] font-bold uppercase tracking-[0.15em] ${item.tone}`}>
                              Live
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid gap-5">
                    <div className="nexus-glass-card rounded-[2rem] p-5 sm:p-6">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-[12px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                            Claim engine
                          </div>
                          <div className="mt-2 text-[1.8rem] font-black tracking-[-0.03em]">
                            Zero-touch ready
                          </div>
                        </div>
                        <div className="rounded-full border border-primary/20 bg-primary/10 p-3 text-primary">
                          <Zap className="h-4 w-4" />
                        </div>
                      </div>

                      <div className="mt-5 space-y-3">
                        <div className="rounded-[1.4rem] border border-border/40 bg-background/38 p-4 dark:bg-background/20">
                          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                            Confidence gate
                          </div>
                          <div className="mt-2 flex items-end justify-between gap-4">
                            <div className="text-3xl font-black tracking-[-0.04em]">92%</div>
                            <div className="text-sm text-muted-foreground">Ready for straight-through payout</div>
                          </div>
                        </div>
                        <div className="rounded-[1.4rem] border border-border/40 bg-background/38 p-4 dark:bg-background/20">
                          <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                            Worker proofs
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <span className="nexus-chip">Face match</span>
                            <span className="nexus-chip">Platform linked</span>
                            <span className="nexus-chip">Session trusted</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="nexus-glass-card rounded-[2rem] p-5 sm:p-6" id="operator">
                      <div className="text-[12px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                        Operator queue
                      </div>
                      <div className="mt-4 space-y-3">
                        {operatorNotes.map((item) => (
                          <div
                            key={item.title}
                            className="rounded-[1.35rem] border border-border/40 bg-background/38 p-4 dark:bg-background/20"
                          >
                            <div className="flex items-center gap-2">
                              <div className={`h-2.5 w-2.5 rounded-full bg-current ${item.tone}`} />
                              <div className="text-sm font-semibold">{item.title}</div>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.meta}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        <motion.section
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.16 }}
          transition={{ duration: 0.55 }}
          className="nexus-lazy-section relative mx-auto w-full max-w-[1760px] px-4 pb-14 sm:px-6 lg:px-8"
          id="signals"
        >
          <div className="nexus-panel rounded-[2rem] p-6 sm:p-8 xl:p-10">
            <div className="nexus-section-heading">
              <div>
                <div className="nexus-section-eyebrow mb-2">Signal stack</div>
                <h2 className="nexus-section-title max-w-3xl">
                  One product surface for worker onboarding, live signal pressure, and claims release.
                </h2>
              </div>
              <div className="nexus-inline-metric">
                <Bot className="h-3.5 w-3.5 text-primary" />
                ML + actuarial orchestration
              </div>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {platformModules.map((module) => (
                <div
                  key={module.title}
                  className="nexus-subpanel rounded-[1.8rem] p-5 sm:p-6 transition-transform duration-300 hover:-translate-y-1"
                >
                  <div className="nexus-section-eyebrow">{module.eyebrow}</div>
                  <h3 className="mt-3 text-[1.55rem] font-black tracking-tight">{module.title}</h3>
                  <p className="mt-3 text-base leading-8 text-muted-foreground">{module.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.16 }}
          transition={{ duration: 0.55 }}
          className="nexus-lazy-section relative mx-auto w-full max-w-[1760px] px-4 pb-14 sm:px-6 lg:px-8"
          id="claims"
        >
          <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
            <div className="nexus-panel rounded-[2rem] p-6 sm:p-8">
              <div className="nexus-section-eyebrow mb-2">Claims architecture</div>
              <h2 className="nexus-section-title">
                Designed for confidence-based release, not manual bottlenecks.
              </h2>
              <p className="mt-4 nexus-section-copy">
                The platform keeps the worker experience lightweight while preserving audit trails, operator control, and financial discipline when a payout actually moves.
              </p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="nexus-kpi-card min-h-[10rem]">
                  <div className="nexus-kpi-label">Settlement path</div>
                  <div className="nexus-kpi-value">Auto</div>
                  <div className="nexus-kpi-meta">High-confidence triggers go straight through.</div>
                </div>
                <div className="nexus-kpi-card min-h-[10rem]">
                  <div className="nexus-kpi-label">Escalation rail</div>
                  <div className="nexus-kpi-value">Assist</div>
                  <div className="nexus-kpi-meta">Edge cases stay explainable for operator review.</div>
                </div>
                <div className="nexus-kpi-card min-h-[10rem]">
                  <div className="nexus-kpi-label">Solvency control</div>
                  <div className="nexus-kpi-value">Pmax</div>
                  <div className="nexus-kpi-meta">Reserve-aware payout release keeps the system credible.</div>
                </div>
              </div>
            </div>

            <div className="nexus-panel-hero rounded-[2rem] p-6 sm:p-8">
              <div className="nexus-section-eyebrow mb-2">Worker flow</div>
              <h2 className="nexus-section-title">Three moves from trust creation to payout confidence.</h2>
              <div className="mt-8 grid gap-4">
                {workflowSteps.map((step) => (
                  <div key={step.step} className="nexus-subpanel rounded-[1.7rem] p-5">
                    <div className="flex gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/12 text-sm font-bold text-primary">
                        {step.step}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold tracking-tight">{step.title}</h3>
                        <p className="mt-2 text-base leading-8 text-muted-foreground">{step.copy}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 32 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.16 }}
          transition={{ duration: 0.55 }}
          className="nexus-lazy-section relative mx-auto w-full max-w-[1760px] px-4 pb-10 sm:px-6 lg:px-8"
          id="platform"
        >
          <div className="nexus-panel rounded-[2.2rem] p-6 sm:p-8 xl:p-10">
            <div className="grid gap-8 xl:grid-cols-[1.06fr_0.94fr] xl:items-end">
              <div>
                <div className="nexus-section-eyebrow mb-2">Operator console</div>
                <h2 className="nexus-section-title max-w-4xl">
                  A premium control surface for workers, operators, and insurer-side teams.
                </h2>
                <p className="mt-4 max-w-3xl text-base leading-8 text-muted-foreground">
                  Launch worker onboarding, supervise claims operations, inspect payout readiness, and manage the full protection lifecycle from one coordinated command layer.
                </p>

                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <button
                    onClick={() => navigate("/platform")}
                    className="inline-flex items-center justify-center gap-2 rounded-[1.2rem] bg-primary px-7 py-[1.15rem] text-[0.98rem] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:bg-primary/90"
                  >
                    Launch worker flow
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => navigate("/admin/auth")}
                    className="inline-flex items-center justify-center gap-2 rounded-[1.2rem] border border-border/60 bg-card/60 px-7 py-[1.15rem] text-[0.98rem] font-semibold transition-all hover:bg-secondary"
                  >
                    Open admin access
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="rounded-[2rem] border border-border/45 bg-card/65 p-5 sm:p-6 dark:border-white/6 dark:bg-black/18">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[12px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                      Enterprise posture
                    </div>
                    <div className="mt-2 text-[1.7rem] font-black tracking-tight">
                      Claims, solvency, and worker trust in one view.
                    </div>
                  </div>
                  <div className="hidden rounded-full border border-primary/18 bg-primary/10 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.14em] text-primary sm:block">
                    Live ready
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <div className="nexus-subpanel rounded-[1.5rem] p-4">
                    <div className="nexus-kpi-label">Straight-through posture</div>
                    <div className="mt-2 text-[1.35rem] font-black tracking-tight">
                      Autonomous, assisted, disputed
                    </div>
                    <p className="mt-2 text-[0.97rem] leading-7 text-muted-foreground">
                      Move between automated and human-reviewed resolution paths without breaking the audit chain.
                    </p>
                  </div>
                  <div className="nexus-subpanel rounded-[1.5rem] p-4">
                    <div className="nexus-kpi-label">Portfolio state</div>
                    <div className="mt-2 text-[1.35rem] font-black tracking-tight">
                      Hyperlocal, reserve-aware, payout-ready
                    </div>
                    <p className="mt-2 text-[0.97rem] leading-7 text-muted-foreground">
                      Monitor worker protection posture without losing capital discipline.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-[12px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  <div className="inline-flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5" />
                    Audit verified
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5" />
                    Reserve aware
                  </div>
                  <div className="inline-flex items-center gap-2">
                    <Wallet className="h-3.5 w-3.5" />
                    Payout traceable
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
