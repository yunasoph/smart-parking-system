import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { post } from '../api';
import { useAuth, homeForRole } from '../AuthContext';

export default function Login() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and password.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const signedIn = await post('/api/auth/login', {
        email: trimmedEmail,
        password
      });
      setUser(signedIn);
      navigate(homeForRole(signedIn.role), { replace: true });
    } catch (err) {
      setError(err.message || 'Incorrect email or password.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-wrap">
      <div className="card stack-lg auth-card">
        <div className="brand" style={{ padding: 0 }}>
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <div>
            <div className="brand-name" style={{ color: 'var(--ink)' }}>
              ParkSmart
            </div>
            <span className="brand-sub" style={{ color: 'var(--muted)' }}>
              City Centre Mall · Lot A
            </span>
          </div>
        </div>

        <div className="stack" style={{ gap: '4px' }}>
          <h1 style={{ fontSize: '24px' }}>Sign in</h1>
          <p className="sub">
            Sign in as a parker, gate operator or administrator.
          </p>
        </div>

        <form className="stack" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError('');
              }}
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError('');
              }}
            />
          </div>

          {error && (
            <div className="err" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={submitting}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="hint" style={{ margin: 0, textAlign: 'center' }}>
          Parking here for the first time?{' '}
          <Link
            to="/register"
            style={{ color: 'var(--teal)', fontWeight: 600 }}
          >
            Create a parker account
          </Link>
        </p>
      </div>
    </main>
  );
}
