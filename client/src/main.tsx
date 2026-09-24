import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { Layout, PageContainer } from "./components/Layout";
import { RequireRole } from "./components/RequireRole";
import { AuthProvider } from "./lib/auth";
import { EmployerDashboardPage } from "./pages/employer/EmployerDashboardPage";
import { EmployerJobPage } from "./pages/employer/EmployerJobPage";
import { JobFormPage } from "./pages/employer/JobFormPage";
import { JobDetailPage } from "./pages/JobDetailPage";
import { JobsPage } from "./pages/JobsPage";
import { MyApplicationsPage } from "./pages/seeker/MyApplicationsPage";
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
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:slug" element={<JobDetailPage />} />
            <Route
              path="/employer"
              element={
                <RequireRole roles={["employer"]}>
                  <EmployerDashboardPage />
                </RequireRole>
              }
            />
            {[
              ["/employer/jobs/new", <JobFormPage key="new" />],
              ["/employer/jobs/:id/edit", <JobFormPage key="edit" />],
              ["/employer/jobs/:id", <EmployerJobPage key="job" />]
            ].map(([path, element]) => (
              <Route
                key={path as string}
                path={path as string}
                element={<RequireRole roles={["employer"]}>{element}</RequireRole>}
              />
            ))}
            <Route
              path="/dashboard/applications"
              element={
                <RequireRole roles={["rep", "admin"]}>
                  <MyApplicationsPage />
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
