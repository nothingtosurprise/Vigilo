import { Component, type ComponentChildren } from "preact";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ComponentChildren;
  fallback?: ComponentChildren;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render(): ComponentChildren {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div
          role="alert"
          className="p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800"
        >
          <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
            Something went wrong
          </h3>
          <p className="text-sm text-red-600 dark:text-red-400 mb-4">
            {this.state.error?.message || "An unexpected error occurred"}
          </p>
          <Button
            onClick={() => this.setState({ hasError: false, error: null })}
            variant="destructive"
            className="min-h-[44px]"
          >
            Try Again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
