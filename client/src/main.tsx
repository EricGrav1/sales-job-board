import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout, PageContainer } from "./components/Layout";
import { RequireRole } from "./components/RequireRole";
import { AuthProvider } from "./lib/auth";
import { EmployerDashboardPage } from "./pages/employer/EmployerDashboardPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfileEditPage } from "./pages/ProfileEditPage";
import { PublicProfilePage } from "./pages/PublicProfilePage";
import { SignupPage } from "./pages/SignupPage";
import { VerifyPage } from "./pages/VerifyPage";
import "./styles.css";

function PlaceholderPage({ title }: { title: string }) {
  return (
    <PageContainer>
      <Link className="text-sm font-medium text-accent" to="/">
        Back
      </Link>
      <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
    </PageContainer>
  );
}

function NotFoundPage() {
  return <PlaceholderPage title="Page not found" />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<LandingPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/verify" element={<VerifyPage />} />
            <Route
              path="/employer"
              element={
                <RequireRole roles={["employer"]}>
                  <EmployerDashboardPage />
                </RequireRole>
              }
            />
            <Route path="/dashboard/*" element={<PlaceholderPage title="Dashboard" />} />
            <Route path="/admin" element={<PlaceholderPage title="Admin" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="/dashboard/edit" element={<ProfileEditPage />} />
          <Route path="/r/:slug" element={<PublicProfilePage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
