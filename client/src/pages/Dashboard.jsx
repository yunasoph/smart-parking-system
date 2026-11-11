import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import { formatCurrency, formatSubtitleDate } from '../format';
import KpiCard from '../components/KpiCard';
import Badge from '../components/Badge';

const ALERT_COPY = {
  overstay: (n) => ({
    t: `${n} vehicles parked over 12 hours`,
    d: 'Check overstays and contact the owners.',
    cta: 'View vehicles',
    to: '/vehicles'
  }),
  unclaimed: (n) => ({
    t: `${n} reservations not claimed`,
    d: 'Held for more than 30 minutes.',
    cta: 'View slots',
    to: '/slots'
  }),
  unpaid: (n) => ({
    t: `${n} payments pending for over an hour`,
    d: 'Vehicles have left but the bill is unpaid.',
    cta: 'View billing',
    to: '/billing'
  })
};

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const res = await get('/api/dashboard');
      setData(res);
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  const subtitle = `Live lot status · ${formatSubtitleDate()}`;

  if (loading && !data) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Dashboard</h1>
            <p className="sub">{subtitle}</p>
          </div>
          <div className="row">
            <Link className="btn" to="/slots">
              Find a slot
            </Link>
            <Link className="btn btn-primary" to="/entry-exit">
              + New entry
            </Link>
          </div>
        </header>
        <p className="muted">Loading…</p>
      </>
    );
  }

  if (error && !data) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Dashboard</h1>
            <p className="sub">{subtitle}</p>
          </div>
        </header>
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
      </>
    );
  }

  let total = 0;
  let occ = 0;
  let res = 0;
  let entries = 0;

  data.floors.forEach((f) => {
    total += f.total;
    occ += f.occupied;
    res += f.reserved;
  });
  data.entriesByHour.forEach((h) => {
    entries += h.count;
  });

  const free = total - occ - res;
  const avg = `${Math.floor(data.avgStayMinutes / 60)} h ${data.avgStayMinutes % 60} m`;
  const occPct = total > 0 ? Math.round((occ / total) * 100) : 0;

  const kpis = [
    {
      label: 'Occupied now',
      value: `${occ} / ${total}`,
      note: `${occPct}% of all slots`
    },
    {
      label: 'Free slots',
      value: String(free),
      note: `${res} more are reserved`
    },
    {
      label: 'Revenue today',
      value: formatCurrency(data.revenueToday),
      note: `from ${data.completedToday} completed sessions`
    },
    {
      label: 'Entries today',
      value: String(entries),
      note: `average stay ${avg}`
    }
  ];

  const maxHourCount = Math.max(
    1,
    ...data.entriesByHour.map((h) => h.count)
  );

  const visibleAlerts = data.alerts.filter((a) => a.count > 0 && ALERT_COPY[a.kind]);

  return (
    <>
      <header className="head">
        <div>
          <h1>Dashboard</h1>
          <p className="sub" id="today">
            {subtitle}
          </p>
        </div>
        <div className="row">
          <Link className="btn" to="/slots">
            Find a slot
          </Link>
          <Link className="btn btn-primary" to="/entry-exit">
            + New entry
          </Link>
        </div>
      </header>

      <div className="stack-lg">
        <section className="grid-kpi" id="kpis" aria-label="Key numbers">
          {kpis.map((k) => (
            <KpiCard key={k.label} label={k.label} value={k.value} note={k.note} />
          ))}
        </section>

        <section className="grid-2">
          <div className="card stack">
            <h2>Occupancy by floor</h2>
            <div className="stack" id="floors">
              {data.floors.map((f) => {
                const pct = f.total > 0 ? Math.round((f.occupied / f.total) * 100) : 0;
                const ow = f.total > 0 ? ((f.occupied / f.total) * 100).toFixed(1) : '0.0';
                const rw = f.total > 0 ? ((f.reserved / f.total) * 100).toFixed(1) : '0.0';
                return (
                  <div key={f.name} className="stack" style={{ gap: '6px' }}>
                    <div
                      className="row between"
                      style={{ fontSize: '14px', flexWrap: 'nowrap' }}
                    >
                      <b>{f.name}</b>
                      <span className="muted">
                        {f.occupied} / {f.total} occupied · {pct}%
                      </span>
                    </div>
                    <div className="stackbar">
                      <div style={{ width: `${ow}%`, background: '#1E3A5F' }} />
                      <div style={{ width: `${rw}%`, background: '#F5B942' }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="legend">
              <span>
                <i className="dot" style={{ background: '#1E3A5F' }} />
                Occupied
              </span>
              <span>
                <i className="dot" style={{ background: '#F5B942' }} />
                Reserved
              </span>
              <span>
                <i
                  className="dot"
                  style={{ background: '#E6F4F2', border: '1px solid #9FD3CE' }}
                />
                Free
              </span>
            </div>
          </div>

          <div className="card stack">
            <h2>Entries by hour, today</h2>
            <div
              className="bars"
              id="hours"
              role="img"
              aria-label="Bar chart of vehicle entries for each hour of the day"
            >
              {data.entriesByHour.map((h) => {
                const px = Math.max(2, Math.round((h.count / maxHourCount) * 135));
                return (
                  <div key={h.hour} className="col">
                    <small>{h.count}</small>
                    <div className="bar" style={{ height: `${px}px` }} />
                    <small>{h.hour}</small>
                  </div>
                );
              })}
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Hour of day along the bottom, vehicles entered above each bar.
            </p>
          </div>
        </section>

        <section className="grid-2">
          <div className="card stack">
            <h2>Recent activity</h2>
            <div className="table-wrap">
              <table style={{ minWidth: '460px' }}>
                <thead>
                  <tr>
                    <th scope="col">Plate</th>
                    <th scope="col">Slot</th>
                    <th scope="col">Event</th>
                    <th scope="col">Time</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody id="activity">
                  {data.activity.map((a, idx) => (
                    <tr key={`${a.plate}-${a.slot}-${idx}`}>
                      <td className="mono">{a.plate}</td>
                      <td>{a.slot}</td>
                      <td>{a.event}</td>
                      <td className="muted">{a.time}</td>
                      <td>
                        <Badge tone={a.tone}>{a.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card stack">
            <h2>Needs attention</h2>
            <div className="stack" id="alerts" style={{ gap: '12px' }}>
              {visibleAlerts.map((a) => {
                const c = ALERT_COPY[a.kind](a.count);
                return (
                  <Link key={a.kind} className="alert" to={c.to}>
                    <b>{c.t}</b>
                    <span>{c.d}</span>
                    <i>{c.cta} →</i>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
