import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { get, post } from '../api';
import { formatCurrency, formatDuration, formatTime24 } from '../format';
import Segmented from '../components/Segmented';

const VEHICLE_TYPES = ['Bike', 'Car', 'SUV'];
const PAYMENT_METHODS = ['UPI', 'Card', 'Cash'];

export default function EntryExit() {
  const [floors, setFloors] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');

  // Entry state
  const [plate, setPlate] = useState('');
  const [vType, setVType] = useState('Car');
  const [prefFloor, setPrefFloor] = useState('Any');
  const [plateErr, setPlateErr] = useState(false);
  const [entryErr, setEntryErr] = useState('');
  const [allocating, setAllocating] = useState(false);
  const [ticket, setTicket] = useState(null);
  const plateInputRef = useRef(null);

  // Exit state
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [exitView, setExitView] = useState('pick'); // 'pick' | 'bill' | 'done'
  const [bill, setBill] = useState(null);
  const [method, setMethod] = useState('UPI');
  const [exitErr, setExitErr] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setPageError('');
      const [floorsRes, activeRes] = await Promise.all([
        get('/api/floors'),
        get('/api/sessions/active')
      ]);
      setFloors(floorsRes);
      setSessions(activeRes);
      setSelectedIdx(0);
    } catch (err) {
      setPageError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshSessions = async () => {
    const activeRes = await get('/api/sessions/active');
    setSessions(activeRes);
    setSelectedIdx(0);
  };

  const handleAllocate = async () => {
    if (allocating) return;
    const trimmed = plate.trim();
    if (!trimmed) {
      setPlateErr(true);
      plateInputRef.current?.focus();
      return;
    }

    setAllocating(true);
    setEntryErr('');
    try {
      const res = await post('/api/entry', {
        plate: trimmed,
        type: vType,
        floor: prefFloor
      });
      setTicket(res);
      await refreshSessions();
    } catch (err) {
      setEntryErr(err.message || 'Something went wrong. Try again.');
    } finally {
      setAllocating(false);
    }
  };

  const handleAnotherEntry = () => {
    setPlate('');
    setTicket(null);
    setEntryErr('');
    setPlateErr(false);
    setTimeout(() => plateInputRef.current?.focus(), 0);
  };

  const handleCalculateFee = async () => {
    if (calculating || !sessions.length) return;
    const current = sessions[selectedIdx] || sessions[0];
    if (!current) return;

    setCalculating(true);
    setExitErr('');
    try {
      const billData = await get(`/api/sessions/${current.id}/bill`);
      setBill({ ...billData, sessionId: current.id });
      setExitView('bill');
    } catch (err) {
      setExitErr(err.message || 'Something went wrong. Try again.');
    } finally {
      setCalculating(false);
    }
  };

  const handleCollectPayment = async () => {
    if (collecting || !bill) return;
    setCollecting(true);
    setExitErr('');
    try {
      const res = await post(`/api/sessions/${bill.sessionId}/exit`, {
        method: method.toUpperCase()
      });
      setReceipt({
        ...res,
        displayMethod: method
      });
      await refreshSessions();
      setExitView('done');
    } catch (err) {
      setExitErr(err.message || 'Something went wrong. Try again.');
    } finally {
      setCollecting(false);
    }
  };

  const handleProcessAnotherExit = async () => {
    setExitErr('');
    setReceipt(null);
    setBill(null);
    try {
      await refreshSessions();
    } catch {
      // handled if needed
    }
    setExitView('pick');
  };

  if (loading) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Entry &amp; Exit</h1>
            <p className="sub">
              The gate desk. Register arrivals and take payment on departure.
            </p>
          </div>
        </header>
        <p className="muted">Loading…</p>
      </>
    );
  }

  if (pageError) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Entry &amp; Exit</h1>
            <p className="sub">
              The gate desk. Register arrivals and take payment on departure.
            </p>
          </div>
        </header>
        <div className="card stack">
          <div className="err" role="alert">
            {pageError}
          </div>
          <div>
            <button type="button" className="btn" onClick={loadData}>
              Try again
            </button>
          </div>
        </div>
      </>
    );
  }

  const floorOptions = [
    { value: 'Any', label: 'Any' },
    ...floors.map((f) => ({ value: f.code, label: f.name }))
  ];

  return (
    <>
      <header className="head">
        <div>
          <h1>Entry &amp; Exit</h1>
          <p className="sub">
            The gate desk. Register arrivals and take payment on departure.
          </p>
        </div>
      </header>

      <div className="grid-2">
        {/* ENTRY */}
        <section className="card stack-lg" aria-label="Vehicle entry">
          <div className="step-head">
            <span
              className="step-no"
              style={{ background: 'var(--teal-t)', color: 'var(--teal-d)' }}
            >
              1
            </span>
            <h2 style={{ fontSize: '20px' }}>Vehicle entry</h2>
          </div>

          {!ticket ? (
            <div className="stack-lg" id="entry-form">
              <div className="field">
                <label htmlFor="plate">Plate number</label>
                <input
                  ref={plateInputRef}
                  id="plate"
                  className="input mono"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="HR 06 AB 1234"
                  value={plate}
                  onChange={(e) => {
                    setPlate(e.target.value.toUpperCase());
                    setPlateErr(false);
                    setEntryErr('');
                  }}
                />
                {plateErr && (
                  <div className="err" id="plate-err" role="alert">
                    Enter the plate number to continue.
                  </div>
                )}
              </div>

              <div className="field">
                <span className="lbl" id="lbl-type">
                  Vehicle type
                </span>
                <Segmented
                  id="types"
                  ariaLabelledby="lbl-type"
                  options={VEHICLE_TYPES}
                  value={vType}
                  onChange={setVType}
                />
              </div>

              <div className="field">
                <span className="lbl" id="lbl-floor">
                  Preferred floor
                </span>
                <Segmented
                  id="floors"
                  ariaLabelledby="lbl-floor"
                  options={floorOptions}
                  value={prefFloor}
                  onChange={setPrefFloor}
                />
              </div>

              {entryErr && (
                <div className="err" id="entry-err" role="alert">
                  {entryErr}
                </div>
              )}

              <button
                className="btn btn-primary btn-lg btn-block"
                type="button"
                id="allocate"
                disabled={allocating}
                onClick={handleAllocate}
              >
                Allocate a slot
              </button>
            </div>
          ) : (
            <div className="stack" id="entry-done">
              <div className="ticket">
                <div className="top">
                  <span>Parking ticket</span>
                  <span className="mono" id="t-no">
                    #{ticket.ticketNo}
                  </span>
                </div>
                <div className="big" id="t-slot">
                  {ticket.slot}
                </div>
                <div className="meta">
                  <div>
                    <small>Plate</small>
                    <span className="mono" id="t-plate">
                      {ticket.plate}
                    </span>
                  </div>
                  <div>
                    <small>Entered</small>
                    <span id="t-time">
                      {formatTime24(ticket.enteredAt)} today
                    </span>
                  </div>
                  <div>
                    <small>Tariff</small>
                    <span id="t-rate">
                      {formatCurrency(ticket.tariff.first)} first hour,{' '}
                      {formatCurrency(ticket.tariff.extra)} after
                    </span>
                  </div>
                </div>
              </div>
              <button
                className="btn btn-block"
                type="button"
                id="another"
                onClick={handleAnotherEntry}
              >
                Register another vehicle
              </button>
            </div>
          )}
        </section>

        {/* EXIT */}
        <section className="card stack-lg" aria-label="Vehicle exit">
          <div className="step-head">
            <span
              className="step-no"
              style={{ background: 'var(--occ-t)', color: 'var(--occ)' }}
            >
              2
            </span>
            <h2 style={{ fontSize: '20px' }}>Vehicle exit</h2>
          </div>

          {exitView === 'pick' && (
            <div className="stack" id="exit-pick">
              <div
                className="lbl"
                style={{ fontSize: '14px', fontWeight: 600 }}
                id="lbl-in-lot"
              >
                Vehicles in the lot
              </div>
              <div
                className="stack"
                style={{ gap: '8px' }}
                role="group"
                aria-labelledby="lbl-in-lot"
                id="sessions"
              >
                {sessions.length === 0 ? (
                  <div className="empty">No vehicles in the lot.</div>
                ) : (
                  sessions.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      className="pick"
                      aria-pressed={i === selectedIdx}
                      onClick={() => setSelectedIdx(i)}
                    >
                      <span className="l">
                        <span className="mono" style={{ fontSize: '15px' }}>
                          {s.plate}
                        </span>
                        <small>
                          {s.type} · slot {s.slot}
                        </small>
                      </span>
                      <span className="r">{formatDuration(s.minutes)}</span>
                    </button>
                  ))
                )}
              </div>
              {exitErr && (
                <div className="err" role="alert">
                  {exitErr}
                </div>
              )}
              {sessions.length > 0 && (
                <button
                  className="btn btn-navy btn-lg btn-block"
                  type="button"
                  id="calc"
                  disabled={calculating}
                  onClick={handleCalculateFee}
                >
                  Calculate fee
                </button>
              )}
            </div>
          )}

          {exitView === 'bill' && bill && (
            <div className="stack" id="exit-bill">
              <div
                className="row between"
                style={{ alignItems: 'baseline' }}
              >
                <span className="mono" style={{ fontSize: '18px' }} id="b-plate">
                  {bill.plate}
                </span>
                <span className="hint" style={{ fontSize: '13px' }} id="b-meta">
                  {bill.type} · slot {bill.slot}
                </span>
              </div>
              <dl className="kv" id="b-rows">
                <div>
                  <dt>Time parked</dt>
                  <dd>{formatDuration(bill.minutes)}</dd>
                </div>
                <div>
                  <dt>Hours billed (rounded up)</dt>
                  <dd>{String(bill.hours)}</dd>
                </div>
                <div>
                  <dt>First hour</dt>
                  <dd>{formatCurrency(bill.first)}</dd>
                </div>
                <div>
                  <dt>
                    {bill.extraHours} extra hour
                    {bill.extraHours === 1 ? '' : 's'} ×{' '}
                    {formatCurrency(bill.extraEach)}
                  </dt>
                  <dd>{formatCurrency(bill.extra)}</dd>
                </div>
              </dl>
              <div className="total-row">
                <dt style={{ fontWeight: 600, fontSize: '14px' }}>Total due</dt>
                <dd id="b-total" style={{ margin: 0 }}>
                  {formatCurrency(bill.total)}
                </dd>
              </div>
              <div className="field">
                <span className="lbl" id="lbl-method">
                  Payment method
                </span>
                <Segmented
                  id="methods"
                  ariaLabelledby="lbl-method"
                  options={PAYMENT_METHODS}
                  value={method}
                  onChange={setMethod}
                />
              </div>
              {exitErr && (
                <div className="err" role="alert">
                  {exitErr}
                </div>
              )}
              <div className="row">
                <button
                  className="btn btn-primary btn-lg"
                  style={{ flex: '1 1 200px' }}
                  type="button"
                  id="collect"
                  disabled={collecting}
                  onClick={handleCollectPayment}
                >
                  Collect payment
                </button>
                <button
                  className="btn btn-lg"
                  type="button"
                  id="back1"
                  onClick={() => {
                    setExitErr('');
                    setExitView('pick');
                  }}
                >
                  Back
                </button>
              </div>
            </div>
          )}

          {exitView === 'done' && receipt && (
            <div className="stack" id="exit-done">
              <div className="receipt">
                <div className="t">Payment received</div>
                <div className="big" id="r-amount">
                  {formatCurrency(receipt.amount)} via {receipt.displayMethod}
                </div>
                <div style={{ fontSize: '14px' }} id="r-text">
                  Slot {receipt.slot} is free again. Safe travels,{' '}
                  <span className="mono">{receipt.plate}</span>.
                </div>
              </div>
              <div className="row">
                <Link className="btn btn-navy" to="/billing">
                  View in billing
                </Link>
                <button
                  className="btn"
                  type="button"
                  id="back2"
                  onClick={handleProcessAnotherExit}
                >
                  Process another exit
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
