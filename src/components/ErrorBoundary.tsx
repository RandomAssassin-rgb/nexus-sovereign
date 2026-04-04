import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  declare state: Readonly<State>;
  declare props: Readonly<Props>;
  declare setState: Component<Props, State>["setState"];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", background: "white", color: "red", height: "100vh", overflow: "auto", zIndex: 9999, position: "fixed", inset: 0 }}>
          <h1>Something went wrong.</h1>
          <h3>{this.state.error?.message}</h3>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", background: "#f5f5f5", padding: "10px", color: "black", borderRadius: "5px" }}>
            {this.state.error?.stack}
          </pre>
          <h4>Component Stack</h4>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", background: "#f5f5f5", padding: "10px", color: "black", borderRadius: "5px" }}>
            {this.state.errorInfo?.componentStack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", background: "red", color: "white", border: "none", borderRadius: "5px", cursor: "pointer", marginTop: "20px" }}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
