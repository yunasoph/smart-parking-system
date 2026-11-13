import React, { useEffect, useState, useCallback, useRef } from 'react';
import { get, patch } from '../api';
import { formatCurrency, formatTime24 } from '../format';
import Segmented from '../components/Segmented';
import Badge from '../components/Badge';

const PAY_METHODS = ['UPI', 'Card'];

const MONTHLY_RATES = {
  Bike: 499,
  Car: 1299,
  SUV: 1799
};

export default function Plans() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Upgrade modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [targetVehicle, setTargetVehicle] = useState(null);
  const [method, setMethod] = useState('UPI');
  const [simulateFail, setSimulateFail] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [receipt, setReceipt] = useState(null);
  const [switchingPlate, setSwitchingPlate] = useState('');

  const modalRef = useRef(null);

  const loadVehicles = useCallback(async () => {
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
    loadVehicles();
  }, [loadVehicles]);

  // Modal focus trap & Esc key
  useEffect(() => {
    if (!modalOpen) return;

    const dialogEl = modalRef.current;
    const focusables = dialogEl
      ? dialogEl.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      : [];
    if (focusables.length > 0) {
      focusables[0].focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !paying) {
        e.preventDefault();
        setModalOpen(false);
        return;
      }
      if (e.key === 'Tab' && dialogEl) {
        const items = Array.from(
          dialogEl.querySelectorAll(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, paying]);

  const handleOpenSubscribe = (veh) => {
    setTargetVehicle(veh);
    setPayError('');
    setSimulateFail(false);
    setModalOpen(true);
  };

  const handleSubscribeMonthly = async () => {
    if (paying || !targetVehicle) return;
    setPaying(true);
    setPayError('');
    setNotice('');

    try {
      const res = await patch(
        `/api/me/vehicles/${encodeURIComponent(targetVehicle.plate)}/plan`,
        {
          plan: 'MONTHLY',
          method: method.toUpperCase(),
          simulate: simulateFail ? 'fail' : 'success'
        }
      );
      setReceipt({
        ...res,
        displayMethod: method
      });
      setModalOpen(false);
      await loadVehicles();
    } catch (err) {
      setPayError(err.message || 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  const handleSwitchHourly = async (veh) => {
    if (switchingPlate) return;
    if (
      !window.confirm(
        `Switch ${veh.plate} back to Pay per hour? Your next parking visits will be billed at standard hourly rates.`
      )
    ) {
      return;
    }

    setSwitchingPlate(veh.plate);
    setError('');
    setNotice('');
    try {
      const res = await patch(
        `/api/me/vehicles/${encodeURIComponent(veh.plate)}/plan`,
        { plan: 'PAY_PER_HOUR' }
      );
      setNotice(res.message || `${veh.plate} switched to Pay per hour.`);
      await loadVehicles();
    } catch (err) {
      setError(err.message || 'Could not update plan.');
    } finally {
      setSwitchingPlate('');
    }
  };

  const getMonthlyPrice = (veh) =>
    veh?.monthlyPrice || MONTHLY_RATES[veh?.type] || 1299;

  return (
    <>
      <header className="head">
        <div>
          <h1>Subscription plan</h1>
          <p className="sub">
            Compare hourly and monthly parking plans and manage subscriptions for your vehicles.
          </p>
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

        {receipt && (
          <section className="card stack-lg" aria-label="Subscription payment receipt">
            <div className="receipt stack">
              <div className="row between">
                <div className="t">Subscription activated</div>
                <Badge tone="teal">Monthly pass active</Badge>
              </div>
              <div className="big">
                {formatCurrency(receipt.amount)} via {receipt.displayMethod}
              </div>
              <dl className="kv" style={{ marginTop: '8px' }}>
                <div>
                  <dt>Payment ref</dt>
                  <dd className="mono">{receipt.txnRef}</dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd className="mono">
                    {receipt.plate} ({receipt.type})
                  </dd>
                </div>
                <div>
                  <dt>Plan</dt>
                  <dd>{receipt.plan}</dd>
                </div>
                <div>
                  <dt>Paid at</dt>
                  <dd>{formatTime24(receipt.paidAt)} today</dd>
                </div>
              </dl>
              <p style={{ margin: '8px 0 0', fontSize: '14px' }}>
                Unlimited entries on all floors now carry a ₹0 exit fee for {receipt.plate}.
              </p>
            </div>

            <div className="row no-print">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => window.print()}
              >
                Download receipt
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setReceipt(null)}
              >
                Done
              </button>
            </div>
          </section>
        )}

        {/* PLAN COMPARISON CARDS */}
        <div className="grid-2">
          <div
            className="card stack"
            style={{
              background: '#FFFFFF',
              border: '2px solid var(--line)',
              gap: '10px'
            }}
          >
            <div className="row between">
              <Badge tone="navy">Standard Plan</Badge>
              <strong style={{ fontSize: '18px' }}>Pay per hour</strong>
            </div>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--muted)' }}>
              No monthly commitment. Pay only when you park using standard hourly rates:
            </p>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6 }}>
              <li>Bike: ₹15 first hour · ₹10 each extra hour</li>
              <li>Car: ₹40 first hour · ₹30 each extra hour</li>
              <li>SUV: ₹60 first hour · ₹45 each extra hour</li>
            </ul>
          </div>

          <div
            className="card stack"
            style={{
              background: 'linear-gradient(135deg, #E6F4F2 0%, #FFFFFF 100%)',
              border: '2px solid var(--teal)',
              gap: '10px'
            }}
          >
            <div className="row between">
              <Badge tone="teal">Subscription Plan</Badge>
              <strong style={{ fontSize: '18px', color: 'var(--teal-d)' }}>
                Monthly pass
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '14px', color: 'var(--ink)' }}>
              Unlimited daily entries with <b>₹0 hourly exit charges</b> across all floors:
            </p>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: 'var(--ink)', lineHeight: 1.6 }}>
              <li>Bike: ₹499 / month</li>
              <li>Car: ₹1,299 / month</li>
              <li>SUV: ₹1,799 / month</li>
            </ul>
          </div>
        </div>

        {/* VEHICLE SUBSCRIPTION LIST */}
        {loading ? (
          <p className="muted">Loading your vehicles…</p>
        ) : error ? (
          <div className="card stack">
            <div className="err" role="alert">
              {error}
            </div>
            <div>
              <button type="button" className="btn" onClick={loadVehicles}>
                Try again
              </button>
            </div>
          </div>
        ) : (
          <section className="card stack" aria-label="Manage vehicle subscriptions">
            <div className="row between">
              <h2>Your vehicle plans</h2>
              <span className="hint">
                Subscribe a vehicle to Monthly pass or switch back anytime.
              </span>
            </div>

            <div className="table-wrap">
              <table style={{ minWidth: '580px' }}>
                <thead>
                  <tr>
                    <th scope="col">Plate</th>
                    <th scope="col">Type</th>
                    <th scope="col">Current plan</th>
                    <th scope="col" className="num">
                      Monthly pass rate
                    </th>
                    <th scope="col" className="num">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => {
                    const isMonthly =
                      v.rawPlan === 'MONTHLY' || v.plan === 'Monthly pass';
                    const price = getMonthlyPrice(v);
                    return (
                      <tr key={v.plate}>
                        <td className="mono" style={{ fontWeight: 600 }}>
                          {v.plate}
                        </td>
                        <td>{v.type}</td>
                        <td>
                          <Badge tone={isMonthly ? 'teal' : 'navy'}>
                            {isMonthly ? 'Monthly pass' : 'Pay per hour'}
                          </Badge>
                        </td>
                        <td className="num">
                          <b>{formatCurrency(price)}</b> / mo
                        </td>
                        <td className="num">
                          {isMonthly ? (
                            <button
                              type="button"
                              className="btn"
                              style={{ minHeight: '36px', padding: '0 14px', fontSize: '13px' }}
                              disabled={switchingPlate === v.plate}
                              onClick={() => handleSwitchHourly(v)}
                            >
                              {switchingPlate === v.plate
                                ? 'Updating…'
                                : 'Switch to Pay per hour'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ minHeight: '36px', padding: '0 14px', fontSize: '13px' }}
                              onClick={() => handleOpenSubscribe(v)}
                            >
                              Subscribe ({formatCurrency(price)}/mo)
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {vehicles.length === 0 && (
              <div className="empty">No vehicles registered on your account yet.</div>
            )}
          </section>
        )}
      </div>

      {/* MONTHLY PASS PAYMENT MODAL */}
      {modalOpen && targetVehicle && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !paying) {
              setModalOpen(false);
            }
          }}
        >
          <div
            ref={modalRef}
            className="modal-sheet stack-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sub-pay-title"
          >
            <div className="row between" style={{ flexWrap: 'nowrap' }}>
              <div className="stack" style={{ gap: '4px' }}>
                <Badge tone="amber">
                  Demo payment: no real money is charged
                </Badge>
                <h2 id="sub-pay-title" style={{ fontSize: '20px' }}>
                  Subscribe to Monthly pass
                </h2>
              </div>
              <button
                type="button"
                className="btn"
                disabled={paying}
                onClick={() => setModalOpen(false)}
                aria-label="Close subscription payment sheet"
              >
                Close
              </button>
            </div>

            <div className="total-row">
              <span style={{ fontWeight: 600, fontSize: '14px' }}>
                {targetVehicle.plate} ({targetVehicle.type}) · 1 month pass
              </span>
              <dd style={{ margin: 0 }}>
                {formatCurrency(getMonthlyPrice(targetVehicle))}
              </dd>
            </div>

            <div className="field">
              <span className="lbl" id="lbl-sub-method">
                Payment method
              </span>
              <Segmented
                id="sub-methods"
                ariaLabelledby="lbl-sub-method"
                options={PAY_METHODS}
                value={method}
                onChange={setMethod}
              />
            </div>

            <label className="check-row" htmlFor="sub-sim-fail">
              <input
                id="sub-sim-fail"
                type="checkbox"
                checked={simulateFail}
                disabled={paying}
                onChange={(e) => {
                  setSimulateFail(e.target.checked);
                  setPayError('');
                }}
              />
              <span>Simulate a failed payment (demo)</span>
            </label>

            {payError && (
              <div className="err" role="alert">
                {payError}
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={paying}
              onClick={handleSubscribeMonthly}
            >
              {paying ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Processing payment…
                </>
              ) : (
                `Pay ${formatCurrency(getMonthlyPrice(targetVehicle))} & activate pass`
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
