import React from 'react';
import { BrowserRouter, Routes, Route, Link, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth, homeForRole } from './AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Slots from './pages/Slots';
import EntryExit from './pages/EntryExit';
import Vehicles from './pages/Vehicles';
import Billing from './pages/Billing';
import Users from './pages/Users';
import MyParking from './pages/MyParking';
import BookSlot from './pages/BookSlot';
import MyVehicles from './pages/MyVehicles';
import MyHistory from './pages/MyHistory';

function RequireRole({ allowed, children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <main className="main">
        <p className="muted">Loading…</p>
      </main>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (allowed && !allowed.includes(user.role)) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }
  return children;
}

function NotFound() {
  const { user } = useAuth();
  const home = user ? homeForRole(user.role) : '/login';
  return (
    <div className="card stack">
      <h1>Page not found</h1>
      <p className="sub">The page you are looking for does not exist.</p>
      <div>
        <Link className="btn btn-primary" to={home}>
          Back to home
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route
            element={
              <RequireRole>
                <Layout />
              </RequireRole>
            }
          >
            {/* Staff & Admin routes */}
            <Route
              path="/"
              element={
                <RequireRole allowed={['ADMIN', 'STAFF']}>
                  <Dashboard />
                </RequireRole>
              }
            />
            <Route
              path="/slots"
              element={
                <RequireRole allowed={['ADMIN', 'STAFF']}>
                  <Slots />
                </RequireRole>
              }
            />
            <Route
              path="/entry-exit"
              element={
                <RequireRole allowed={['ADMIN', 'STAFF']}>
                  <EntryExit />
                </RequireRole>
              }
            />
            <Route
              path="/vehicles"
              element={
                <RequireRole allowed={['ADMIN', 'STAFF']}>
                  <Vehicles />
                </RequireRole>
              }
            />
            <Route
              path="/billing"
              element={
                <RequireRole allowed={['ADMIN', 'STAFF']}>
                  <Billing />
                </RequireRole>
              }
            />

            {/* Admin-only route */}
            <Route
              path="/users"
              element={
                <RequireRole allowed={['ADMIN']}>
                  <Users />
                </RequireRole>
              }
            />

            {/* Parker routes */}
            <Route
              path="/my-parking"
              element={
                <RequireRole allowed={['PARKER']}>
                  <MyParking />
                </RequireRole>
              }
            />
            <Route
              path="/book-slot"
              element={
                <RequireRole allowed={['PARKER']}>
                  <BookSlot />
                </RequireRole>
              }
            />
            <Route
              path="/my-vehicles"
              element={
                <RequireRole allowed={['PARKER']}>
                  <MyVehicles />
                </RequireRole>
              }
            />
            <Route
              path="/history"
              element={
                <RequireRole allowed={['PARKER']}>
                  <MyHistory />
                </RequireRole>
              }
            />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
