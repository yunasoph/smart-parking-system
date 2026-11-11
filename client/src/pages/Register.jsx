import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, homeForRole } from '../AuthContext';
import Segmented from '../components/Segmented';

const VEHICLE_TYPES = ['Bike', 'Car', 'SUV'];

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [plate, setPlate] = useState('');
  const [vType, setVType] = useState('Car');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={homeForRole(user.role)} replace />;
  }

  const validate = () => {
    const next = {};
    if (!name.trim()) next.name = 'Enter your full name.';
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (!password || password.length < 8) {
      next.password = 'Password must be at least 8 characters.';
    }
    if (!/^[6-9][0-9]{9}$/.test(phone.trim())) {
      next.phone = 'Enter a 10-digit mobile number.';
    }
    if (!plate.trim()) {
      next.plate = 'Enter your vehicle plate number.';
    }
    return next;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setErrors({});
    setServerError('');
    try {
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        phone: phone.trim(),
        plate: plate.trim().toUpperCase(),
        type: vType
      });
      navigate('/my-parking', { replace: true });
    } catch (err) {
      setServerError(err.message || 'Could not create your account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-wrap">
      <div className="card stack-lg auth-card" style={{ maxWidth: '480px' }}>
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
          <h1 style={{ fontSize: '24px' }}>Create parker account</h1>
          <p className="sub">
            Register your details and primary vehicle to track parking and pay from your phone.
          </p>
        </div>

        <form className="stack" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="reg-name">Full name</label>
            <input
              id="reg-name"
              className="input"
              type="text"
              autoComplete="name"
              placeholder="Isha Kapoor"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setErrors((prev) => ({ ...prev, name: '' }));
                setServerError('');
              }}
            />
            {errors.name && (
              <div className="err" role="alert">
                {errors.name}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrors((prev) => ({ ...prev, email: '' }));
                setServerError('');
              }}
            />
            {errors.email && (
              <div className="err" role="alert">
                {errors.email}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setErrors((prev) => ({ ...prev, password: '' }));
                setServerError('');
              }}
            />
            {errors.password && (
              <div className="err" role="alert">
                {errors.password}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="reg-phone">Phone number</label>
            <input
              id="reg-phone"
              className="input mono"
              type="tel"
              inputMode="numeric"
              maxLength={10}
              placeholder="9810422110"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setErrors((prev) => ({ ...prev, phone: '' }));
                setServerError('');
              }}
            />
            {errors.phone && (
              <div className="err" role="alert">
                {errors.phone}
              </div>
            )}
          </div>

          <div className="field">
            <label htmlFor="reg-plate">Vehicle plate number</label>
            <input
              id="reg-plate"
              className="input mono"
              type="text"
              autoCapitalize="characters"
              placeholder="HR 06 CD 3380"
              value={plate}
              onChange={(e) => {
                setPlate(e.target.value.toUpperCase());
                setErrors((prev) => ({ ...prev, plate: '' }));
                setServerError('');
              }}
            />
            {errors.plate && (
              <div className="err" role="alert">
                {errors.plate}
              </div>
            )}
          </div>

          <div className="field">
            <span className="lbl" id="lbl-reg-type">
              Vehicle type
            </span>
            <Segmented
              id="reg-types"
              ariaLabelledby="lbl-reg-type"
              options={VEHICLE_TYPES}
              value={vType}
              onChange={setVType}
            />
          </div>

          {serverError && (
            <div className="err" role="alert">
              {serverError}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={submitting}
          >
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="hint" style={{ margin: 0, textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--teal)', fontWeight: 600 }}>
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
