import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { HubProvider } from "./lib/store";
import { AuthProvider, useAuth } from "./lib/auth";
import { ToastProvider } from "./components/ui/Toast";
import LoginPage, { PendingPage, SetPasswordPage } from "./components/LoginPage";
import { envError } from "./lib/supabase";

// Online: sign in first (or set a new password after a reset link), and wait for HR's approval. Offline: straight into the Hub.
function Gate() {
  const { online, loading, session, profile, recovery } = useAuth();
  if (envError)
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <p className="max-w-md rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">Setup problem: {envError}</p>
      </div>
    );
  if (online && loading) return <div className="grid min-h-screen place-items-center text-sm text-ink-500">Loading…</div>;
  if (online && !session) return <LoginPage />;
  if (online && recovery) return <SetPasswordPage />;
  if (online && !profile?.approved) return <PendingPage />;
  return (
    <HubProvider>
      <App />
    </HubProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <ToastProvider>
        <Gate />
      </ToastProvider>
    </AuthProvider>
  </StrictMode>
);
