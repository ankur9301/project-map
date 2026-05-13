import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AuthGate from "./components/AuthGate";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ color: "#111827", background: "#f7f8fb", minHeight: "100vh", padding: 24 }}>
          <section style={{ background: "#fff", border: "1px solid #d9e0ea", borderRadius: 8, padding: 20 }}>
            <h1>Frontend error</h1>
            <pre style={{ whiteSpace: "pre-wrap" }}>{this.state.error.message}</pre>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate>
        <App />
      </AuthGate>
    </ErrorBoundary>
  </React.StrictMode>
);
