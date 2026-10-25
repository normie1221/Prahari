import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App.jsx";
import "leaflet/dist/leaflet.css";
import "./styles/tokens.css";
import "./styles/global.css";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const DEV_BYPASS = import.meta.env.VITE_AUTH_DEV_BYPASS === "true";

function Root() {
  if (DEV_BYPASS || !PUBLISHABLE_KEY) {
    if (!DEV_BYPASS) {
      // eslint-disable-next-line no-console
      console.warn(
        "[PRAHARI] VITE_CLERK_PUBLISHABLE_KEY is not set. Falling back to dev-bypass mode — " +
        "set the key in .env and VITE_AUTH_DEV_BYPASS=false for real authentication.",
      );
    }
    return (
      <BrowserRouter>
        <App devBypass />
      </BrowserRouter>
    );
  }
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ClerkProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
