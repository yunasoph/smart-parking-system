import React, { useEffect, useState, useCallback, useRef } from 'react';
import { get, post } from '../api';
import { formatCurrency, formatDuration, formatTime24 } from '../format';
import Segmented from '../components/Segmented';
import Badge from '../components/Badge';

const PAY_METHODS = ['UPI', 'Card'];

export default function MyParking() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Payment sheet modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [method, setMethod] = useState('UPI');
  const [simulateFail, setSimulateFail] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [receipt, setReceipt] = useState(null);

  const modalRef = useRef(null);
  const openBtnRef = useRef(null);

  const loadActive = useCallback(async () => {
    try {
      setError('');
      const res = await get('/api/me/sessions/active');
      setSession(Array.isArray(res) ? res[0] || null : res || null);
    } catch (err) {
      setError(err.message || 'Could not load your parking status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActive();
    const timer = setInterval(loadActive, 30000);
    return () => clearInterval(timer);
  }, [loadActive]);

  // Modal focus trap and Escape handling
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
        openBtnRef.current?.focus();
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

  const handleOpenModal = () => {
    setPayError('');
    setSimulateFail(false);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    if (paying) return;
    setModalOpen(false);
    openBtnRef.current?.focus();
  };

  const handlePay = async () => {
    if (paying || !session) return;
    setPaying(true);
    setPayError('');
    try {
      const res = await post(`/api/me/sessions/${session.id}/pay`, {
        method: method.toUpperCase(),
        simulate: simulateFail ? 'fail' : 'success'
      });
      setReceipt({
        ...res,
        displayMethod: method
      });
      setModalOpen(false);
      await loadActive();
    } catch (err) {
      setPayError(err.message || 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>My parking</h1>
          <p className="sub">
            Live status of your parked vehicle and instant exit payment.
          </p>
        </div>
      </header>

      <div className="center-col stack-lg">
        {loading && !session && !receipt ? (
          <p className="muted">Loading…</p>
        ) : error && !session ? (
          <div className="card stack">
            <div className="err" role="alert">
              {error}
            </div>
            <div>
              <button type="button" className="btn" onClick={loadActive}>
                Try again
              </button>
            </div>
          </div>
        ) : receipt ? (
          <section className="card stack-lg" aria-label="Payment receipt">
            <div className="receipt stack">
              <div className="row between">
                <div className="t">Payment received</div>
                <Badge tone="teal">Gate will open</Badge>
              </div>
              <div className="big">
                {formatCurrency(receipt.amount)} via {receipt.displayMethod}
              </div>
              <dl className="kv" style={{ marginTop: '8px' }}>
                <div>
                  <dt>Reference</dt>
                  <dd className="mono">{receipt.txnRef}</dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd className="mono">{receipt.plate}</dd>
                </div>
                <div>
                  <dt>Slot</dt>
                  <dd>{receipt.slot}</dd>
                </div>
                <div>
                  <dt>Paid at</dt>
                  <dd>{formatTime24(receipt.paidAt)} today</dd>
                </div>
              </dl>
              <p style={{ margin: '8px 0 0', fontSize: '14px' }}>
                Gate will open automatically as you approach the exit barrier.
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
        ) : session ? (
          <section className="card stack-lg" aria-label="Current parking session">
            <div className="ticket">
              <div className="top">
                <span>Currently parked · {session.floor}</span>
                <span className="mono">{session.type}</span>
              </div>
              <div className="big">{session.slot}</div>
              <div className="meta">
                <div>
                  <small>Plate</small>
                  <span className="mono">{session.plate}</span>
                </div>
                <div>
                  <small>Entered</small>
                  <span>{formatTime24(session.enteredAt)}</span>
                </div>
                <div>
                  <small>Time parked</small>
                  <span>{formatDuration(session.minutes)}</span>
                </div>
                <div>
                  <small>Fee so far</small>
                  <span style={{ fontWeight: 700, color: 'var(--teal-d)' }}>
                    {formatCurrency(session.fee)}
                  </span>
                </div>
              </div>
            </div>

            <div className="row between">
              <span className="hint">
                Refreshes automatically every 30 seconds.
              </span>
              <button
                ref={openBtnRef}
                type="button"
                className="btn btn-primary btn-lg"
                onClick={handleOpenModal}
              >
                Pay and exit
              </button>
            </div>
          </section>
        ) : (
          <section className="card stack" aria-label="No active session">
            <div className="empty">You are not parked right now.</div>
          </section>
        )}
      </div>

      {modalOpen && session && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
        >
          <div
            ref={modalRef}
            className="modal-sheet stack-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pay-modal-title"
          >
            <div className="row between" style={{ flexWrap: 'nowrap' }}>
              <div className="stack" style={{ gap: '4px' }}>
                <Badge tone="amber">
                  Demo payment: no real money is charged
                </Badge>
                <h2 id="pay-modal-title" style={{ fontSize: '20px' }}>
                  Pay and exit
                </h2>
              </div>
              <button
                type="button"
                className="btn"
                disabled={paying}
                onClick={handleCloseModal}
                aria-label="Close payment sheet"
              >
                Close
              </button>
            </div>

            <div className="total-row">
              <span style={{ fontWeight: 600, fontSize: '14px' }}>
                Amount due ({session.plate} · Slot {session.slot})
              </span>
              <dd style={{ margin: 0 }}>{formatCurrency(session.fee)}</dd>
            </div>

            <div className="field">
              <span className="lbl" id="lbl-parker-method">
                Payment method
              </span>
              <Segmented
                id="parker-methods"
                ariaLabelledby="lbl-parker-method"
                options={PAY_METHODS}
                value={method}
                onChange={setMethod}
              />
            </div>

            <label className="check-row" htmlFor="sim-fail">
              <input
                id="sim-fail"
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
              onClick={handlePay}
            >
              {paying ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Processing payment…
                </>
              ) : (
                `Pay ${formatCurrency(session.fee)}`
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
