import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button"; 

interface Props {
  children: ReactNode;
  fallbackRender?: (error: Error, errorInfo: ErrorInfo, resetErrorBoundary: () => void) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> { // Return type corrected
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo }); // Correctly use this.setState
    // logErrorToMyService(error, errorInfo);
  }

  resetErrorBoundary = () => {
    this.setState({ hasError: false, error: null, errorInfo: null }); // Correctly use this.setState
  };

  public render() {
    if (this.state.hasError && this.state.error) { // Correctly access state via this.state
      if (this.props.fallbackRender && this.state.errorInfo) { // Correctly access props via this.props
        return this.props.fallbackRender(this.state.error, this.state.errorInfo, this.resetErrorBoundary);
      }

      return (
        <div style={{ padding: '20px', border: '1px solid red', margin: '10px', borderRadius: '8px', backgroundColor: '#fff0f0' }}>
          <h2>Algo deu errado.</h2>
          <details style={{ whiteSpace: "pre-wrap", marginTop: '10px', marginBottom: '10px' }}>
            {this.state.error && this.state.error.toString()}
            <br />
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </details>
          <Button onClick={this.resetErrorBoundary} variant="outline">
            Tentar novamente
          </Button>
        </div>
      );
    }

    return this.props.children; // Correctly access props via this.props
  }
}

export default ErrorBoundary;