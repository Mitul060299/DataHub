import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { UserProvider } from "./contexts/UserContext";
import "./styles/global.css";
import { Analytics } from "@vercel/analytics/react";

// Capture unhandled JS errors with full stack trace for production debugging
window.addEventListener("error", (e) => {
  const info = { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error?.stack ?? "" };
  try { sessionStorage.setItem("datahub_last_error", JSON.stringify(info)); } catch { /* ignore */ }
  console.error("[datahub global error]", info);
});
window.addEventListener("unhandledrejection", (e) => {
  const msg = e.reason instanceof Error ? e.reason.stack : String(e.reason);
  try { sessionStorage.setItem("datahub_last_rejection", msg); } catch { /* ignore */ }
  console.error("[datahub unhandled rejection]", msg);
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <UserProvider>
          <App />
          <Analytics />
        </UserProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
