import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-2 py-1 text-sm font-medium ${isActive ? "text-accent" : "text-slate-700 hover:text-slate-950"}`;
}

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-6">
          <Link to="/" className="text-base font-bold tracking-tight text-slate-950">
            Sales<span className="text-accent">Job</span>Board
          </Link>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1 sm:gap-3">
            <NavLink to="/jobs" className={navClass}>
              Find jobs
            </NavLink>
            {user?.role === "employer" ? (
              <>
                <NavLink to="/employer" end className={navClass}>
                  Dashboard
                </NavLink>
                <NavLink to="/employer/billing" className={navClass}>
                  Billing
                </NavLink>
              </>
            ) : null}
            {user && user.role !== "employer" ? (
              <NavLink to="/dashboard/applications" className={navClass}>
                My applications
              </NavLink>
            ) : null}
            {!user ? (
              <>
                <NavLink to="/signup?type=employer" className={navClass}>
                  Post a job
                </NavLink>
                <NavLink to="/login" className={navClass}>
                  Log in
                </NavLink>
                <Link to="/signup" className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
                  Sign up
                </Link>
              </>
            ) : (
              <button type="button" onClick={handleLogout} className="rounded-md px-2 py-1 text-sm font-medium text-slate-700 hover:text-slate-950">
                Log out
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs text-slate-500 sm:px-6">
          Sales jobs from SDR to CRO. Pay ranges on every listing.
        </div>
      </footer>
    </div>
  );
}

export function PageContainer({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  return <div className={`mx-auto px-4 py-8 sm:px-6 sm:py-10 ${narrow ? "max-w-md" : "max-w-6xl"}`}>{children}</div>;
}
