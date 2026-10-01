import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint no-console allows warn/error — same convention as the backend.
    console.error("Unhandled error in the UI", error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
    window.location.href = "/";
  };

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex flex-1 items-center justify-center p-6">
          <Card className="max-w-sm text-center">
            <p className="mb-4 text-sm text-ink-muted">Что-то пошло не так. Попробуйте вернуться на главную.</p>
            <Button onClick={this.reset}>На главную</Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
