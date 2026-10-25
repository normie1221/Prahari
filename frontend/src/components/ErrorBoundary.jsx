import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("[PRAHARI] Uncaught render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="state-block state-block--error" style={{ minHeight: "50vh" }}>
          <h3 style={{ color: "var(--paper)" }}>Something went wrong on this page</h3>
          <p>This page hit an unexpected error. The rest of PRAHARI should still work.</p>
          <button className="btn btn-primary" onClick={() => this.setState({ hasError: false })}>
            Try again
          </button>
          <button className="btn btn-secondary" onClick={() => { window.location.href = "/dashboard"; }}>
            Back to Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
