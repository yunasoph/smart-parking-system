import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';

export default function Layout() {
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <div className="logo">P</div>
          <b>ParkSmart</b>
        </div>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            Dashboard
          </NavLink>
          <NavLink to="/slots">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <path d="M9 17V7h4a3 3 0 0 1 0 6H9" />
            </svg>
            Slots
          </NavLink>
          <NavLink to="/entry-exit">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 8h13M13 4l4 4-4 4M20 16H7M11 12l-4 4 4 4" />
            </svg>
            Entry &amp; Exit
          </NavLink>
          <NavLink to="/vehicles">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 15v-3l2-5h14l2 5v3M3 15h18M6 15v3M18 15v3" />
            </svg>
            Vehicles
          </NavLink>
          <NavLink to="/billing">
            <svg
              aria-hidden="true"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M3 10h18" />
            </svg>
            Billing
          </NavLink>
        </nav>
        <div className="account">
          <span className="avatar">OP</span>
          <div>
            <strong>Operator</strong>
            Main lot
          </div>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
