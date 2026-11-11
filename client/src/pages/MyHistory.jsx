import React, { useEffect, useState, useCallback } from 'react';
import { get } from '../api';
import { formatCurrency, formatDuration, formatTime24 } from '../format';
import StatusBadge from '../components/StatusBadge';

function formatSessionDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const datePart = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  return `${datePart} · ${formatTime24(d)}`;
}

export default function MyHistory() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await get('/api/me/sessions/history');
      setSessions(res);
    } catch (err) {
      setError(err.message || 'Could not load your parking history.');
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
          <h1>History</h1>
          <p className="sub">
            Your past and current parking sessions, durations and receipts.
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
        <section className="card stack" aria-label="Session history">
          <div className="table-wrap">
            <table style={{ minWidth: '580px' }}>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Plate</th>
                  <th scope="col">Slot</th>
                  <th scope="col">Duration</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{formatSessionDate(s.enteredAt)}</td>
                    <td className="mono">{s.plate}</td>
                    <td>
                      {s.slot}{' '}
                      <span className="muted" style={{ fontSize: '12px' }}>
                        ({s.floor})
                      </span>
                    </td>
                    <td>{formatDuration(s.minutes)}</td>
                    <td className="num">
                      <b>{formatCurrency(s.amount ?? s.fee)}</b>
                    </td>
                    <td>
                      <StatusBadge status={s.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sessions.length === 0 && (
            <div className="empty">No parking sessions recorded yet.</div>
          )}
        </section>
      )}
    </>
  );
}
