import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api';
import StatusBadge from '../components/StatusBadge';
import Segmented from '../components/Segmented';

const VEHICLE_TYPES = ['Bike', 'Car', 'SUV'];

export default function MyVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // New Vehicle Modal State
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [newPlate, setNewPlate] = useState('');
  const [newType, setNewType] = useState('Car');
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await get('/api/me/vehicles');
      setVehicles(res);
    } catch (err) {
      setError(err.message || 'Could not load your vehicles.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRegisterVehicle = async (e) => {
    e.preventDefault();
    if (registering) return;

    const trimmed = newPlate.trim().toUpperCase();
    if (!trimmed) {
      setRegError('Please enter a vehicle plate number.');
      return;
    }

    setRegistering(true);
    setRegError('');

    try {
      const res = await post('/api/me/vehicles', {
        plate: trimmed,
        type: newType,
        plan: 'PAY_PER_HOUR'
      });
      setNotice(`Vehicle ${res.plate} (${res.type}) registered!`);
      setRegModalOpen(false);
      setNewPlate('');
      setNewType('Car');
      await load();
    } catch (err) {
      setRegError(err.message || 'Failed to register vehicle.');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>My vehicles</h1>
          <p className="sub">
            Vehicles registered to your account and their current lot status.
          </p>
        </div>
        <div className="row">
          <Link className="btn" to="/plans">
            Subscription plans
          </Link>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setRegError('');
              setRegModalOpen(true);
            }}
          >
            + Register vehicle
          </button>
        </div>
      </header>

      <div className="stack-lg">
        {notice && (
          <div className="notice row between" role="status">
            <span>{notice}</span>
            <button
              type="button"
              className="btn-link"
              onClick={() => setNotice('')}
            >
              ✕
            </button>
          </div>
        )}

        {loading ? (
          <p className="muted">Loading your vehicles…</p>
        ) : error ? (
          <div className="card stack">
            <div className="err" role="alert">
              {error}
            </div>
            <div>
              <button type="button" className="btn" onClick={load}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <section className="card stack" aria-label="Registered vehicles">
            <div className="table-wrap">
              <table style={{ minWidth: '520px' }}>
                <thead>
                  <tr>
                    <th scope="col">Plate</th>
                    <th scope="col">Type</th>
                    <th scope="col">Plan</th>
                    <th scope="col" className="num">
                      Visits
                    </th>
                    <th scope="col">Current status</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v.plate}>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {v.plate}
                      </td>
                      <td>{v.type}</td>
                      <td>
                        <StatusBadge status={v.plan} />
                      </td>
                      <td className="num">{v.visits}</td>
                      <td>
                        {v.slot ? (
                          <StatusBadge
                            status={`Parked · ${v.slot}`}
                            tone="navy"
                          />
                        ) : v.inLot ? (
                          <StatusBadge status="Parked" tone="navy" />
                        ) : (
                          <span className="muted">Not in lot</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {vehicles.length === 0 && (
              <div className="empty stack">
                <p>No vehicles found on your account.</p>
                <div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setRegModalOpen(true)}
                  >
                    + Register your first vehicle
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* NEW VEHICLE REGISTRATION MODAL */}
      {regModalOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !registering) {
              setRegModalOpen(false);
            }
          }}
        >
          <div
            className="modal-sheet stack-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reg-modal-title"
          >
            <div className="row between" style={{ flexWrap: 'nowrap' }}>
              <div>
                <h2 id="reg-modal-title" style={{ fontSize: '20px' }}>
                  Register a new vehicle
                </h2>
                <p className="sub" style={{ fontSize: '13px' }}>
                  Add a car, SUV or bike to your account.
                </p>
              </div>
              <button
                type="button"
                className="btn"
                disabled={registering}
                onClick={() => setRegModalOpen(false)}
              >
                Close
              </button>
            </div>

            <form className="stack-lg" onSubmit={handleRegisterVehicle}>
              <div className="field">
                <label htmlFor="reg-plate">Plate number</label>
                <input
                  id="reg-plate"
                  className="input mono"
                  type="text"
                  placeholder="HR 26 DQ 5521"
                  autoFocus
                  value={newPlate}
                  onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="field">
                <span className="lbl">Vehicle type</span>
                <Segmented
                  id="reg-type"
                  options={VEHICLE_TYPES}
                  value={newType}
                  onChange={setNewType}
                />
              </div>

              {regError && (
                <div className="err" role="alert">
                  {regError}
                </div>
              )}

              <div className="row between">
                <button
                  type="button"
                  className="btn"
                  disabled={registering}
                  onClick={() => setRegModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={registering}
                >
                  {registering ? 'Registering…' : 'Register vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
