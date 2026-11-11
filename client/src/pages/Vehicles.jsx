import React, { useEffect, useState, useCallback } from 'react';
import { get, post } from '../api';
import Segmented from '../components/Segmented';
import StatusBadge from '../components/StatusBadge';

const PLANS = ['All', 'Monthly pass', 'Pay per hour', 'Visitor'];
const VEHICLE_TYPES = ['Bike', 'Car', 'SUV'];

export default function Vehicles() {
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [plan, setPlan] = useState('All');
  const [vehicles, setVehicles] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Form state
  const [newPlate, setNewPlate] = useState('');
  const [newType, setNewType] = useState('Car');
  const [newOwner, setNewOwner] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [plateErr, setPlateErr] = useState('');
  const [ownerErr, setOwnerErr] = useState(false);
  const [phoneErr, setPhoneErr] = useState(false);
  const [savedNotice, setSavedNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const loadVehicles = useCallback(async (searchText, planFilter) => {
    try {
      setError('');
      const params = new URLSearchParams();
      if (searchText) params.set('q', searchText);
      if (planFilter) params.set('plan', planFilter);
      const res = await get(`/api/vehicles?${params.toString()}`);
      setVehicles(res.vehicles);
      setTotal(res.total);
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVehicles(debouncedQ, plan);
  }, [debouncedQ, plan, loadVehicles]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;

    const plateTrimmed = newPlate.trim();
    const ownerTrimmed = newOwner.trim();
    const phoneDigits = newPhone.replace(/\D/g, '');

    let ok = true;
    if (!plateTrimmed) {
      setPlateErr('Enter the plate number.');
      ok = false;
    } else {
      setPlateErr('');
    }

    if (!ownerTrimmed) {
      setOwnerErr(true);
      ok = false;
    } else {
      setOwnerErr(false);
    }

    if (phoneDigits.length !== 10) {
      setPhoneErr(true);
      ok = false;
    } else {
      setPhoneErr(false);
    }

    if (!ok) return;

    setSaving(true);
    setSavedNotice('');
    try {
      const created = await post('/api/vehicles', {
        plate: plateTrimmed,
        type: newType,
        owner: ownerTrimmed,
        phone: phoneDigits
      });
      setSavedNotice(`${created.plate} registered to ${created.owner}.`);
      setNewPlate('');
      setNewOwner('');
      setNewPhone('');
      await loadVehicles(debouncedQ, plan);
    } catch (err) {
      setPlateErr(err.message || 'Something went wrong. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !vehicles.length && total === 0) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Vehicles</h1>
            <p className="sub">
              Registered vehicles and their owners. Search by plate or owner
              name.
            </p>
          </div>
        </header>
        <p className="muted">Loading…</p>
      </>
    );
  }

  if (error && !vehicles.length && total === 0) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Vehicles</h1>
            <p className="sub">
              Registered vehicles and their owners. Search by plate or owner
              name.
            </p>
          </div>
        </header>
        <div className="card stack">
          <div className="err" role="alert">
            {error}
          </div>
          <div>
            <button
              type="button"
              className="btn"
              onClick={() => loadVehicles(debouncedQ, plan)}
            >
              Try again
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <header className="head">
        <div>
          <h1>Vehicles</h1>
          <p className="sub">
            Registered vehicles and their owners. Search by plate or owner name.
          </p>
        </div>
      </header>

      <div className="split">
        <section className="card stack grow" aria-label="Vehicle list">
          <div className="row between" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 240px' }}>
              <label htmlFor="q">Search</label>
              <input
                id="q"
                className="input"
                style={{ minHeight: '44px', fontSize: '15px' }}
                type="search"
                autoComplete="off"
                placeholder="Plate or owner name"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <Segmented
              id="plans"
              ariaLabel="Plan"
              options={PLANS}
              value={plan}
              onChange={setPlan}
            />
          </div>

          <div
            className="hint"
            style={{ fontSize: '13px' }}
            aria-live="polite"
            id="count"
          >
            Showing {vehicles.length} of {total} vehicles
          </div>

          <div className="table-wrap">
            <table style={{ minWidth: '560px' }}>
              <thead>
                <tr>
                  <th scope="col">Plate</th>
                  <th scope="col">Type</th>
                  <th scope="col">Owner</th>
                  <th scope="col">Plan</th>
                  <th scope="col" className="num">
                    Visits
                  </th>
                  <th scope="col">Last seen</th>
                </tr>
              </thead>
              <tbody id="rows">
                {vehicles.map((v) => (
                  <tr key={v.plate}>
                    <td className="mono">{v.plate}</td>
                    <td>{v.type}</td>
                    <td>{v.owner}</td>
                    <td>
                      <StatusBadge status={v.plan} />
                    </td>
                    <td className="num">{v.visits}</td>
                    <td className="muted">{v.last}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {vehicles.length === 0 && (
            <div className="empty" id="empty">
              No vehicle matches. Try a shorter search.
            </div>
          )}
        </section>

        <aside className="rail">
          <form className="card stack" id="form" noValidate onSubmit={handleSubmit}>
            <h2>Register a vehicle</h2>
            <div className="field">
              <label htmlFor="np">Plate number</label>
              <input
                id="np"
                className="input mono"
                style={{ fontSize: '16px' }}
                type="text"
                autoComplete="off"
                placeholder="HR 06 AB 1234"
                value={newPlate}
                onChange={(e) => {
                  setNewPlate(e.target.value.toUpperCase());
                  setPlateErr('');
                  setSavedNotice('');
                }}
              />
              {plateErr && (
                <div className="err" id="np-err" role="alert">
                  {plateErr}
                </div>
              )}
            </div>

            <div className="field">
              <span className="lbl" id="lbl-vt">
                Vehicle type
              </span>
              <Segmented
                id="vtypes"
                ariaLabelledby="lbl-vt"
                options={VEHICLE_TYPES}
                value={newType}
                onChange={setNewType}
              />
            </div>

            <div className="field">
              <label htmlFor="no">Owner name</label>
              <input
                id="no"
                className="input"
                type="text"
                autoComplete="off"
                placeholder="Full name"
                value={newOwner}
                onChange={(e) => {
                  setNewOwner(e.target.value);
                  setOwnerErr(false);
                }}
              />
              {ownerErr && (
                <div className="err" id="no-err" role="alert">
                  Enter the owner&apos;s name.
                </div>
              )}
            </div>

            <div className="field">
              <label htmlFor="nph">Phone</label>
              <input
                id="nph"
                className="input"
                type="tel"
                inputMode="numeric"
                autoComplete="off"
                placeholder="10-digit mobile"
                value={newPhone}
                onChange={(e) => {
                  setNewPhone(e.target.value);
                  setPhoneErr(false);
                }}
              />
              {phoneErr && (
                <div className="err" id="nph-err" role="alert">
                  Enter a 10-digit mobile number.
                </div>
              )}
            </div>

            {savedNotice && (
              <div className="notice" id="saved" role="status">
                {savedNotice}
              </div>
            )}

            <button
              className="btn btn-primary btn-lg btn-block"
              type="submit"
              disabled={saving}
            >
              Save vehicle
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}
