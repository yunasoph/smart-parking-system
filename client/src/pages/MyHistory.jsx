import React, { useEffect, useState, useCallback } from 'react';
import { get } from '../api';
import { formatCurrency, formatDuration, formatTime24 } from '../format';
import StatusBadge from '../components/StatusBadge';
import Badge from '../components/Badge';

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
  const [onlinePayments, setOnlinePayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const [sessRes, payRes] = await Promise.all([
        get('/api/me/sessions/history'),
        get('/api/me/payments')
      ]);
      setSessions(sessRes);
      setOnlinePayments(Array.isArray(payRes) ? payRes : []);
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
            Your past parking visits, advance bookings and monthly pass receipts.
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
        <div className="stack-lg">
          <section className="card stack" aria-label="Session history">
            <h2>Parking visits</h2>
            <div className="table-wrap">
              <table style={{ minWidth: '620px' }}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Plate</th>
                    <th scope="col">Slot</th>
                    <th scope="col">Duration</th>
                    <th scope="col" className="num">
                      Paid at exit
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
                        {s.prepaid > 0 && (
                          <div className="hint" style={{ fontSize: '11px' }}>
                            +{formatCurrency(s.prepaid)} prepaid on booking
                          </div>
                        )}
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

          <section className="card stack" aria-label="Online booking and pass payments">
            <h2>Advance bookings &amp; monthly passes</h2>
            <div className="table-wrap">
              <table style={{ minWidth: '620px' }}>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Reference</th>
                    <th scope="col">Type</th>
                    <th scope="col">Plate</th>
                    <th scope="col">Method</th>
                    <th scope="col" className="num">
                      Amount
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {onlinePayments.map((p) => {
                    let statusLabel = 'Paid';
                    let statusTone = 'teal';
                    if (p.kind === 'BOOKING') {
                      if (p.status === 'PAID') {
                        statusLabel = 'Reserved';
                        statusTone = 'amber';
                      } else if (p.status === 'USED') {
                        statusLabel = 'Claimed';
                        statusTone = 'teal';
                      } else if (p.status === 'REFUNDED') {
                        statusLabel = 'Refunded';
                        statusTone = 'amber';
                      } else if (p.status === 'EXPIRED') {
                        statusLabel = 'Expired';
                        statusTone = 'red';
                      }
                    }
                    return (
                      <tr key={p.id}>
                        <td>{formatSessionDate(p.createdAt)}</td>
                        <td className="mono">{p.txnRef}</td>
                        <td>
                          <Badge tone={p.kind === 'PASS' ? 'teal' : 'navy'}>
                            {p.kind === 'PASS'
                              ? 'Monthly pass'
                              : `Advance booking${p.slot ? ` · ${p.slot}` : ''}`}
                          </Badge>
                        </td>
                        <td className="mono">{p.plate}</td>
                        <td>{p.method}</td>
                        <td className="num">
                          <b>{formatCurrency(p.amount)}</b>
                        </td>
                        <td>
                          <StatusBadge status={statusLabel} tone={statusTone} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {onlinePayments.length === 0 && (
              <div className="empty">No advance bookings or monthly pass purchases yet.</div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
