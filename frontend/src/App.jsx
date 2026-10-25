import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SignedIn, SignedOut, SignIn, SignUp } from "@clerk/clerk-react";

import AppShell from "./components/layout/AppShell.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import LandingPage from "./pages/LandingPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import NavigationPage from "./pages/NavigationPage.jsx";
import JourneyPage from "./pages/JourneyPage.jsx";
import IncidentsPage from "./pages/IncidentsPage.jsx";
import CommunityPage from "./pages/CommunityPage.jsx";
import CommunityGroupPage from "./pages/CommunityGroupPage.jsx";
import PostDetailPage from "./pages/PostDetailPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import EmergencyPage from "./pages/EmergencyPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";

function Protected({ devBypass, children }) {
  if (devBypass) return children;
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <Navigate to="/sign-in" replace />
      </SignedOut>
    </>
  );
}

export default function App({ devBypass = false }) {
  return (
    <Routes>
      <Route path="/" element={<LandingPage devBypass={devBypass} />} />

      {!devBypass && (
        <>
          <Route
            path="/sign-in/*"
            element={
              <div className="auth-page">
                <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" afterSignInUrl="/dashboard" />
              </div>
            }
          />
          <Route
            path="/sign-up/*"
            element={
              <div className="auth-page">
                <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" afterSignUpUrl="/dashboard" />
              </div>
            }
          />
        </>
      )}

      <Route
        path="/*"
        element={
          <Protected devBypass={devBypass}>
            <AppShell>
              <Routes>
                <Route path="dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
                <Route path="navigation" element={<ErrorBoundary><NavigationPage /></ErrorBoundary>} />
                <Route path="journey/:id" element={<ErrorBoundary><JourneyPage /></ErrorBoundary>} />
                <Route path="incidents" element={<ErrorBoundary><IncidentsPage /></ErrorBoundary>} />
                <Route path="community" element={<ErrorBoundary><CommunityPage /></ErrorBoundary>} />
                <Route path="community/:groupId" element={<ErrorBoundary><CommunityGroupPage /></ErrorBoundary>} />
                <Route path="community/post/:id" element={<ErrorBoundary><PostDetailPage /></ErrorBoundary>} />
                <Route path="profile" element={<ErrorBoundary><ProfilePage /></ErrorBoundary>} />
                <Route path="emergency" element={<ErrorBoundary><EmergencyPage /></ErrorBoundary>} />
                <Route path="admin" element={<ErrorBoundary><AdminPage /></ErrorBoundary>} />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppShell>
          </Protected>
        }
      />
    </Routes>
  );
}
