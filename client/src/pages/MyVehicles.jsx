import React, { useEffect, useState, useCallback } from 'react';
import { get } from '../api';
import StatusBadge from '../components/StatusBadge';

export default function MyVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <>
      <header className="head">
        <div>
          <h1>My vehicles</h1>
          <p className="sub">
            Vehicles registered to your account and their current lot status.
          </p>
        </div>
      </header>

      {loading ? (
        <p className="muted">Loading…</p>
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
                    <td className="mono">{v.plate}</td>
                    <td>{v.type}</td>
                    <td>
                      <StatusBadge status={v.plan} />
                    </td>
                    <td className="num">{v.visits}</td>
                    <td>
                      {v.slot ? (
                        <StatusBadge status={`Parked · ${v.slot}`} tone="navy" />
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
            <div className="empty">No vehicles found on your account.</div>
          )}
        </section>
      )}
    </>
  );
}
