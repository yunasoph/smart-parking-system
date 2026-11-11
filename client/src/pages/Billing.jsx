import React, { useEffect, useState, useCallback } from 'react';
import { get } from '../api';
import { formatCurrency } from '../format';
import KpiCard from '../components/KpiCard';
import Segmented from '../components/Segmented';
import StatusBadge from '../components/StatusBadge';

const STATUS_FILTERS = ['All', 'Paid', 'Pending', 'Failed'];
const METHOD_COLORS = {
  UPI: '#1E3A5F',
  Card: '#0B7A75',
  Cash: '#F5B942'
};

export default function Billing() {
  const [summary, setSummary] = useState(null);
  const [tariff, setTariff] = useState([]);
  const [payments, setPayments] = useState([]);
  const [statusFilter, setStatusFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAll = useCallback(async (filterVal) => {
    try {
      setError('');
      const [sumRes, tarRes, payRes] = await Promise.all([
        get('/api/billing/summary'),
        get('/api/tariff'),
        get(`/api/payments?status=${encodeURIComponent(filterVal)}`)
      ]);
      setSummary(sumRes);
      setTariff(tarRes);
      setPayments(payRes);
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll(statusFilter);
  }, [statusFilter, loadAll]);

  if (loading && !summary) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Billing</h1>
            <p className="sub">
              Payments, revenue and the tariff that prices every session.
            </p>
          </div>
        </header>
        <p className="muted">Loading…</p>
      </>
    );
  }

  if (error && !summary) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Billing</h1>
            <p className="sub">
              Payments, revenue and the tariff that prices every session.
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
              onClick={() => loadAll(statusFilter)}
            >
              Try again
            </button>
          </div>
        </div>
      </>
    );
  }

  const avgBill =
    summary.paymentsToday > 0
      ? Math.round(summary.collectedToday / summary.paymentsToday)
      : 0;

  const tiles = [
    {
      label: 'Collected today',
      value: formatCurrency(summary.collectedToday),
      note: `${summary.paymentsToday} payments`
    },
    {
      label: 'Pending',
      value: formatCurrency(summary.pending),
      note: `${summary.pendingCount} closed sessions unpaid`
    },
    {
      label: 'Failed',
      value: formatCurrency(summary.failed),
      note: `${summary.failedCount} payment to retry`
    },
    {
      label: 'Average bill',
      value: formatCurrency(avgBill),
      note: 'collected ÷ payments'
    }
  ];

  const maxDayAmount = Math.max(
    1,
    ...summary.revenueByDay.map((d) => d.amount)
  );

  return (
    <>
      <header className="head">
        <div>
          <h1>Billing</h1>
          <p className="sub">
            Payments, revenue and the tariff that prices every session.
          </p>
        </div>
      </header>

      <div className="stack-lg">
        <section className="grid-kpi" id="tiles" aria-label="Key numbers">
          {tiles.map((t) => (
            <KpiCard key={t.label} label={t.label} value={t.value} note={t.note} />
          ))}
        </section>

        <section className="grid-2">
          <div className="card stack">
            <h2>Revenue, last 7 days</h2>
            <div
              className="bars tall"
              id="days"
              role="img"
              aria-label="Bar chart of revenue for each of the last seven days"
            >
              {summary.revenueByDay.map((d, i) => {
                const isLast = i === summary.revenueByDay.length - 1;
                const heightPx = Math.max(
                  2,
                  Math.round((d.amount / maxDayAmount) * 150)
                );
                return (
                  <div key={`${d.day}-${i}`} className="col">
                    <small>{(d.amount / 1000).toFixed(1)}</small>
                    <div
                      className="bar"
                      style={{
                        height: `${heightPx}px`,
                        ...(isLast ? { background: '#7FC4BF' } : {})
                      }}
                    />
                    <small>{d.day}</small>
                  </div>
                );
              })}
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Amounts in ₹ thousands. The last bar is today and is still growing.
            </p>
          </div>

          <div className="card stack">
            <h2>Tariff</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">Vehicle</th>
                  <th scope="col" className="num">
                    First hour
                  </th>
                  <th scope="col" className="num">
                    Each extra hour
                  </th>
                </tr>
              </thead>
              <tbody id="tariff">
                {tariff.map((t) => (
                  <tr key={t.type}>
                    <td>
                      <b>{t.type}</b>
                    </td>
                    <td className="num">{formatCurrency(t.first)}</td>
                    <td className="num">{formatCurrency(t.extra)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="stack" style={{ gap: '8px' }}>
              <b style={{ fontSize: '13px' }}>Payment methods today</b>
              <div className="stackbar" id="mix-bar">
                {summary.methodMix.map((m) => (
                  <div
                    key={m.method}
                    style={{
                      width: `${m.pct}%`,
                      background: m.color || METHOD_COLORS[m.method] || '#1E3A5F'
                    }}
                  />
                ))}
              </div>
              <div className="legend" id="mix-legend">
                {summary.methodMix.map((m) => (
                  <span key={m.method}>
                    <i
                      className="dot"
                      style={{
                        background:
                          m.color || METHOD_COLORS[m.method] || '#1E3A5F'
                      }}
                    />
                    {m.method} {m.pct}%
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="card stack" aria-label="Payments">
          <div className="row between">
            <h2>Recent payments</h2>
            <Segmented
              id="filters"
              ariaLabel="Payment status"
              options={STATUS_FILTERS}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>

          <div className="table-wrap">
            <table style={{ minWidth: '520px' }}>
              <thead>
                <tr>
                  <th scope="col">Receipt</th>
                  <th scope="col">Plate</th>
                  <th scope="col">Method</th>
                  <th scope="col" className="num">
                    Amount
                  </th>
                  <th scope="col">Time</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody id="rows">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.id}</td>
                    <td className="mono">{p.plate}</td>
                    <td>{p.method}</td>
                    <td className="num">
                      <b>{formatCurrency(p.amount)}</b>
                    </td>
                    <td className="muted">{p.time}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {payments.length === 0 && (
            <div className="empty" id="empty">
              No payments in this view.
            </div>
          )}
        </section>
      </div>
    </>
  );
}
