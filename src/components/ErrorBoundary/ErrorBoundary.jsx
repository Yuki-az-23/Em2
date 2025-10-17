/**
 * ErrorBoundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs errors, and displays a fallback UI.
 */

import React from 'react';
import { Button } from '../Button/Button';
import './ErrorBoundary.css';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error to console
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Update state with error details
    this.setState({
      error,
      errorInfo,
    });

    // TODO: Log error to error reporting service
    // Example: logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Render fallback UI
      return (
        <div className="error-boundary">
          <div className="error-boundary__content">
            <h1>Oops! Something went wrong</h1>
            <p className="error-boundary__message">
              We're sorry for the inconvenience. The app encountered an unexpected error.
            </p>

            {this.props.showDetails && this.state.error && (
              <details className="error-boundary__details">
                <summary>Error Details (for developers)</summary>
                <pre className="error-boundary__stack">
                  {this.state.error.toString()}
                  {'\n\n'}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="error-boundary__actions">
              <Button
                variant="primary"
                onClick={this.handleReset}
              >
                Try Again
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.href = '/'}
              >
                Go to Home
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
