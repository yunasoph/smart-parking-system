import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Slots from './pages/Slots';
import EntryExit from './pages/EntryExit';
import Vehicles from './pages/Vehicles';
import Billing from './pages/Billing';

function NotFound() {
  return (
    <div className="card stack">
      <h1>Page not found</h1>
      <p className="sub">The page you are looking for does not exist.</p>
      <div>
        <Link className="btn btn-primary" to="/">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/slots" element={<Slots />} />
          <Route path="/entry-exit" element={<EntryExit />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
