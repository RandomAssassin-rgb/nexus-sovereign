import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCcw, Shield } from "lucide-react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

const isDev = import.meta.env.DEV;

class ErrorBoundary extends Component<Props, State> {
  declare state: Readonly<State>;
  declare props: Readonly<Props>;
  declare setState: Component<Props, State>["setState"];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="nexus-page-background flex min-h-screen items-center justify-center px-6 py-10">
        <div className="nexus-panel w-full max-w-2xl rounded-[2rem] p-8 sm:p-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.16em] text-primary">
                <Shield className="h-3.5 w-3.5" />
                Session guard engaged
              </div>
              <h1 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
                Something interrupted the Nexus workspace.
              </h1>
              <p className="mt-4 text-base leading-8 text-muted-foreground">
                Your data was not cleared. Reload the session to restore the app shell, or return to the secure entry screen.
              </p>
            </div>

            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.5rem] border border-destructive/20 bg-destructive/10 text-destructive">
              <AlertTriangle className="h-7 w-7" />
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => window.location.reload()}
              className="nexus-button-primary min-w-[12rem]"
            >
              <RefreshCcw className="h-4 w-4" />
              Reload app
            </button>
            <button
              onClick={() => window.location.assign("/")}
              className="nexus-button-secondary min-w-[12rem]"
            >
              Return to home
            </button>
          </div>

          {isDev ? (
            <details className="nexus-subpanel mt-8 rounded-[1.5rem] p-5">
              <summary className="cursor-pointer text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Developer diagnostics
              </summary>
              <div className="mt-4 space-y-4 text-sm text-muted-foreground">
                <div>
                  <div className="mb-2 font-semibold text-foreground">Error</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-black/5 p-4 text-xs text-foreground dark:bg-white/5">
                    {this.state.error?.stack || this.state.error?.message || "Unknown error"}
                  </pre>
                </div>
                <div>
                  <div className="mb-2 font-semibold text-foreground">Component stack</div>
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-black/5 p-4 text-xs text-foreground dark:bg-white/5">
                    {this.state.errorInfo?.componentStack || "No component stack available"}
                  </pre>
                </div>
              </div>
            </details>
          ) : null}
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
