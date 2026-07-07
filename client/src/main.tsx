import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import "./styles.css";

function LandingPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
        <p className="mb-4 text-sm font-semibold uppercase tracking-wide text-accent">Verified rep profiles</p>
        <h1 className="max-w-3xl text-5xl font-semibold leading-tight">Sales Job Board</h1>
        <p className="mt-5 max-w-2xl text-lg text-slate-700">
          Create a proof-backed sales profile for hiring teams that care about verified performance.
        </p>
        <div className="mt-8 flex gap-3">
          <Link className="rounded-md bg-accent px-4 py-2 font-medium text-white" to="/signup">
            Sign up
          </Link>
          <Link className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-900" to="/login">
            Log in
          </Link>
        </div>
      </section>
    </main>
  );
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-12 text-slate-950">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-medium text-accent" to="/">
          Back
        </Link>
        <h1 className="mt-6 text-3xl font-semibold">{title}</h1>
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/signup" element={<PlaceholderPage title="Create account" />} />
        <Route path="/login" element={<PlaceholderPage title="Log in" />} />
        <Route path="/verify" element={<PlaceholderPage title="Verify email" />} />
        <Route path="/dashboard/*" element={<PlaceholderPage title="Dashboard" />} />
        <Route path="/admin" element={<PlaceholderPage title="Admin" />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
