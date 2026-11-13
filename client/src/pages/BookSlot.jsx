import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { get, post, del } from '../api';
import { formatCurrency, formatTime24 } from '../format';
import Segmented from '../components/Segmented';
import Badge from '../components/Badge';
import StatusBadge from '../components/StatusBadge';

const DURATION_OPTIONS = [
  { value: '30', label: '30 mins (Quick)' },
  { value: '60', label: '1 hour (Standard)' },
  { value: '120', label: '2 hours (Extended)' }
];

const KIND_OPTIONS = [
  { value: 'ANY', label: 'Any type' },
  { value: 'REGULAR', label: 'Regular' },
  { value: 'EV', label: 'EV Charging' },
  { value: 'ACCESSIBLE', label: 'Accessible' }
];

const PAY_METHODS = ['UPI', 'Card'];

const FALLBACK_TARIFF = {
  Bike: { firstHour: 15, extraHour: 10 },
  Car: { firstHour: 40, extraHour: 30 },
  SUV: { firstHour: 60, extraHour: 45 }
};

function computeBookingFee(vehicle, holdMinutes) {
  const rate =
    vehicle && vehicle.firstHour != null
      ? { firstHour: Number(vehicle.firstHour), extraHour: Number(vehicle.extraHour) }
      : FALLBACK_TARIFF[vehicle?.type] || FALLBACK_TARIFF.Car;
  const hours = Math.max(1, Math.ceil(Number(holdMinutes) / 60));
  return rate.firstHour + (hours - 1) * rate.extraHour;
}

function durationLabel(val) {
  if (val === '30') return '30 mins';
  if (val === '60') return '1 hour';
  if (val === '120') return '2 hours';
  return `${val} mins`;
}

export default function BookSlot() {
  const [vehicles, setVehicles] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Booking Form State
  const [selectedPlate, setSelectedPlate] = useState('');
  const [prefFloor, setPrefFloor] = useState('Any');
  const [prefKind, setPrefKind] = useState('ANY');
  const [duration, setDuration] = useState('30');
  const [specificSlot, setSpecificSlot] = useState('');
  const [showBayPicker, setShowBayPicker] = useState(false);

  // Payment modal & receipt state
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [method, setMethod] = useState('UPI');
  const [simulateFail, setSimulateFail] = useState(false);
  const [booking, setBooking] = useState(false);
  const [payErr, setPayErr] = useState('');
  const [bookingReceipt, setBookingReceipt] = useState(null);

  const [bookErr, setBookErr] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  const modalRef = useRef(null);
  const proceedBtnRef = useRef(null);

  const loadData = useCallback(async () => {
    try {
      setError('');
      const [vehsRes, resRes, slotsRes] = await Promise.all([
        get('/api/me/vehicles'),
        get('/api/me/reservations'),
        get('/api/me/available-slots')
      ]);

      setVehicles(vehsRes);
      setReservations(resRes);
      setAvailableSlots(slotsRes);

      if (vehsRes.length > 0 && !selectedPlate) {
        const availableVeh =
          vehsRes.find(
            (v) =>
              !v.inLot &&
              !resRes.some((r) => r.plate === v.plate && r.minutesRemaining > 0)
          ) || vehsRes[0];
        setSelectedPlate(availableVeh.plate);
      }
    } catch (err) {
      setError(err.message || 'Failed to load booking details.');
    } finally {
      setLoading(false);
    }
  }, [selectedPlate]);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, [loadData]);

  // Modal focus trap & Esc key
  useEffect(() => {
    if (!payModalOpen) return;

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
      if (e.key === 'Escape' && !booking) {
        e.preventDefault();
        setPayModalOpen(false);
        proceedBtnRef.current?.focus();
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
  }, [payModalOpen, booking]);

  const selectedVehicle = vehicles.find((v) => v.plate === selectedPlate);
  const bookingFee = computeBookingFee(selectedVehicle, duration);

  const floorsList = [
    { value: 'Any', label: 'Any floor' },
    { value: 'G', label: 'Ground floor' },
    { value: 'L1', label: 'Level 1' },
    { value: 'L2', label: 'Level 2' }
  ];

  const filteredSlots = availableSlots.filter((s) => {
    if (prefFloor !== 'Any' && s.floorCode !== prefFloor) return false;
    if (prefKind !== 'ANY' && s.kind !== prefKind) return false;
    return true;
  });

  const handleOpenPayModal = (e) => {
    e.preventDefault();
    if (!selectedPlate) return;
    setBookErr('');
    setPayErr('');
    setSimulateFail(false);
    setPayModalOpen(true);
  };

  const handleClosePayModal = () => {
    if (booking) return;
    setPayModalOpen(false);
    proceedBtnRef.current?.focus();
  };

  const handleConfirmAndPay = async () => {
    if (booking || !selectedPlate) return;

    setBooking(true);
    setPayErr('');
    setSuccessNotice('');

    try {
      const res = await post('/api/me/reservations', {
        plate: selectedPlate,
        floor: prefFloor,
        kind: prefKind,
        slotCode: specificSlot || undefined,
        holdMinutes: Number(duration),
        method: method.toUpperCase(),
        simulate: simulateFail ? 'fail' : 'success'
      });

      setBookingReceipt({
        ...res,
        displayMethod: method
      });
      setPayModalOpen(false);
      setSpecificSlot('');
      setShowBayPicker(false);
      await loadData();
    } catch (err) {
      setPayErr(err.message || 'Payment failed. Please try again.');
    } finally {
      setBooking(false);
    }
  };

  const handleCancel = async (id, plate, slot) => {
    if (!window.confirm(`Cancel reservation for ${plate} (Slot ${slot})?`)) {
      return;
    }
    setCancellingId(id);
    try {
      await del(`/api/me/reservations/${id}`);
      setSuccessNotice(`Reservation for ${plate} was cancelled.`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to cancel reservation.');
    } finally {
      setCancellingId(null);
    }
  };

  const activeReservations = reservations.filter((r) => r.minutesRemaining > 0);
  const selectedIsBlocked =
    !selectedVehicle ||
    selectedVehicle.inLot ||
    activeReservations.some((r) => r.plate === selectedVehicle.plate);

  if (loading) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Book a slot</h1>
            <p className="sub">
              Reserve a parking space in advance for guaranteed parking.
            </p>
          </div>
        </header>
        <p className="muted">Loading booking portal…</p>
      </>
    );
  }

  return (
    <>
      <header className="head">
        <div>
          <h1>Book a slot</h1>
          <p className="sub">
            Reserve a parking bay in advance for guaranteed parking before you arrive.
          </p>
        </div>
        <Link className="btn" to="/my-parking">
          View live parking status
        </Link>
      </header>

      <div className="center-col stack-lg">
        {error && (
          <div className="card stack">
            <div className="err" role="alert">
              {error}
            </div>
            <div>
              <button type="button" className="btn" onClick={loadData}>
                Try again
              </button>
            </div>
          </div>
        )}

        {successNotice && (
          <div className="notice row between" role="status">
            <span>{successNotice}</span>
            <button
              type="button"
              className="btn-link"
              onClick={() => setSuccessNotice('')}
            >
              ✕
            </button>
          </div>
        )}

        {/* BOOKING PAYMENT RECEIPT */}
        {bookingReceipt && (
          <section className="card stack-lg" aria-label="Booking payment receipt">
            <div className="receipt stack">
              <div className="row between">
                <div className="t">Payment received</div>
                <Badge tone="teal">Slot {bookingReceipt.slot} reserved</Badge>
              </div>
              <div className="big">
                {formatCurrency(bookingReceipt.amount)} via {bookingReceipt.displayMethod}
              </div>
              <dl className="kv" style={{ marginTop: '8px' }}>
                <div>
                  <dt>Payment ref</dt>
                  <dd className="mono">{bookingReceipt.txnRef}</dd>
                </div>
                <div>
                  <dt>Booking ref</dt>
                  <dd className="mono">#{bookingReceipt.ticketNo}</dd>
                </div>
                <div>
                  <dt>Vehicle</dt>
                  <dd className="mono">{bookingReceipt.plate}</dd>
                </div>
                <div>
                  <dt>Reserved bay</dt>
                  <dd>
                    {bookingReceipt.slot} ({bookingReceipt.floor})
                  </dd>
                </div>
                <div>
                  <dt>Hold expires at</dt>
                  <dd>{formatTime24(bookingReceipt.expiresAt)} today</dd>
                </div>
              </dl>
              <p style={{ margin: '8px 0 0', fontSize: '14px' }}>
                Your bay is guaranteed and held until {formatTime24(bookingReceipt.expiresAt)}.
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
                onClick={() => setBookingReceipt(null)}
              >
                Done
              </button>
            </div>
          </section>
        )}

        {/* ACTIVE ADVANCE BOOKINGS */}
        {activeReservations.length > 0 && (
          <section className="stack" aria-label="Active reservations">
            <h2 style={{ fontSize: '18px' }}>Your active reservations</h2>
            {activeReservations.map((r) => (
              <div key={r.id} className="ticket" style={{ border: '2px solid var(--mint)' }}>
                <div className="top">
                  <span>
                    Advance Booking · {r.floor} · {r.kind}
                  </span>
                  <Badge tone="amber">
                    Expires in {r.minutesRemaining} min ({formatTime24(r.expiresAt)})
                  </Badge>
                </div>
                <div className="big">{r.slot}</div>
                <div className="meta">
                  <div>
                    <small>Plate</small>
                    <span className="mono">{r.plate}</span>
                  </div>
                  <div>
                    <small>Vehicle type</small>
                    <span>{r.type}</span>
                  </div>
                  <div>
                    <small>Booking ref</small>
                    <span className="mono">#{r.ticketNo}</span>
                  </div>
                  <div>
                    <small>Paid</small>
                    <span>
                      {formatCurrency(r.amount)} {r.txnRef ? `· ${r.txnRef}` : ''}
                    </span>
                  </div>
                </div>

                <div
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.15)',
                    paddingTop: '14px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                  }}
                >
                  <p style={{ margin: 0, fontSize: '13px', color: '#C9D6E5' }}>
                    Gate check-in will automatically allocate your reserved bay on arrival.
                  </p>
                  <button
                    type="button"
                    className="btn btn-navy"
                    style={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }}
                    disabled={cancellingId === r.id}
                    onClick={() => handleCancel(r.id, r.plate, r.slot)}
                  >
                    {cancellingId === r.id ? 'Cancelling…' : 'Cancel booking'}
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* NEW ADVANCE BOOKING FORM */}
        <section className="card stack-lg" aria-label="Request a booking">
          <div className="step-head">
            <span
              className="step-no"
              style={{ background: 'var(--teal-t)', color: 'var(--teal-d)' }}
            >
              ★
            </span>
            <div>
              <h2 style={{ fontSize: '20px' }}>Request a new advance booking</h2>
              <p className="hint">
                Select your vehicle and preferences. Payment confirms and holds the bay for you.
              </p>
            </div>
          </div>

          {vehicles.length === 0 ? (
            <div className="empty stack">
              <p>You do not have any registered vehicles on your account yet.</p>
              <div>
                <Link className="btn btn-primary" to="/my-vehicles">
                  + Register a vehicle first
                </Link>
              </div>
            </div>
          ) : (
            <form className="stack-lg" onSubmit={handleOpenPayModal}>
              {/* Vehicle Picker */}
              <div className="field">
                <span className="lbl">Select vehicle</span>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: '10px'
                  }}
                >
                  {vehicles.map((v) => {
                    const isSelected = selectedPlate === v.plate;
                    const hasActiveRes = activeReservations.some(
                      (r) => r.plate === v.plate
                    );
                    const disabled = v.inLot || hasActiveRes;

                    return (
                      <button
                        key={v.plate}
                        type="button"
                        className="pick"
                        style={{
                          opacity: disabled ? 0.6 : 1,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          borderColor: isSelected ? 'var(--teal)' : 'var(--line)',
                          background: isSelected ? 'var(--teal-t)' : '#fff'
                        }}
                        disabled={disabled}
                        aria-pressed={isSelected}
                        onClick={() => {
                          setSelectedPlate(v.plate);
                          setBookErr('');
                        }}
                      >
                        <div className="l">
                          <span className="mono" style={{ fontWeight: 700 }}>
                            {v.plate}
                          </span>
                          <small>{v.type}</small>
                        </div>
                        <div className="r">
                          {v.inLot ? (
                            <Badge tone="navy">In Lot</Badge>
                          ) : hasActiveRes ? (
                            <Badge tone="amber">Reserved</Badge>
                          ) : isSelected ? (
                            <Badge tone="teal">Selected</Badge>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Floor Preference */}
              <div className="field">
                <span className="lbl">Preferred floor</span>
                <Segmented
                  id="pref-floor"
                  options={floorsList}
                  value={prefFloor}
                  onChange={(val) => {
                    setPrefFloor(val);
                    setSpecificSlot('');
                  }}
                />
              </div>

              {/* Slot Kind Preference */}
              <div className="field">
                <span className="lbl">Bay type</span>
                <Segmented
                  id="pref-kind"
                  options={KIND_OPTIONS}
                  value={prefKind}
                  onChange={(val) => {
                    setPrefKind(val);
                    setSpecificSlot('');
                  }}
                />
              </div>

              {/* Hold Duration */}
              <div className="field">
                <span className="lbl">Advance hold window</span>
                <Segmented
                  id="pref-duration"
                  options={DURATION_OPTIONS}
                  value={duration}
                  onChange={setDuration}
                />
                <span className="hint">
                  The slot will be kept reserved for this duration from confirmation.
                </span>
              </div>

              {/* Optional: Pick Specific Bay */}
              <div className="stack" style={{ gap: '8px' }}>
                <button
                  type="button"
                  className="btn"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={() => setShowBayPicker(!showBayPicker)}
                >
                  {showBayPicker
                    ? '▲ Hide individual bay selector'
                    : '▼ Choose a specific bay number (optional)'}
                </button>

                {showBayPicker && (
                  <div
                    className="card stack"
                    style={{ background: '#F8FAFC', gap: '10px' }}
                  >
                    <div className="row between">
                      <span className="hint">
                        {filteredSlots.length} available bays matching your floor/type preference:
                      </span>
                      {specificSlot && (
                        <button
                          type="button"
                          className="btn-link"
                          style={{ fontSize: '12px' }}
                          onClick={() => setSpecificSlot('')}
                        >
                          Clear specific selection (Auto-assign)
                        </button>
                      )}
                    </div>
                    {filteredSlots.length === 0 ? (
                      <p className="muted" style={{ fontSize: '13px' }}>
                        No free bays matching this floor/kind combination right now. You can still select &quot;Any floor&quot; or &quot;Auto-allocate&quot;.
                      </p>
                    ) : (
                      <div className="slot-grid" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                        {filteredSlots.map((s) => {
                          const isPicked = specificSlot === s.code;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className="slot free"
                              style={{
                                border: isPicked
                                  ? '3px solid var(--navy)'
                                  : '2px solid var(--teal)',
                                background: isPicked ? 'var(--mint)' : 'var(--teal-t)',
                                color: 'var(--ink)'
                              }}
                              onClick={() => setSpecificSlot(s.code)}
                            >
                              <span>{s.code}</span>
                              <small>{s.kind === 'REGULAR' ? s.floorCode : s.kind}</small>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {specificSlot && (
                      <div className="notice" style={{ padding: '8px 12px', fontSize: '13px' }}>
                        Selected specific bay: <b>{specificSlot}</b>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="total-row">
                <span style={{ fontWeight: 600, fontSize: '14px' }}>
                  Advance booking fee ({selectedVehicle?.type || 'Vehicle'} · {durationLabel(duration)})
                </span>
                <dd style={{ margin: 0 }}>{formatCurrency(bookingFee)}</dd>
              </div>

              {bookErr && (
                <div className="err" role="alert">
                  {bookErr}
                </div>
              )}

              <button
                ref={proceedBtnRef}
                type="submit"
                className="btn btn-primary btn-lg btn-block"
                disabled={booking || selectedIsBlocked}
              >
                {`Proceed to payment (${formatCurrency(bookingFee)})`}
              </button>
            </form>
          )}
        </section>

        {/* RECENT BOOKING HISTORY */}
        {reservations.length > 0 && (
          <section className="card stack" aria-label="Reservation history">
            <h2 style={{ fontSize: '18px' }}>Your reservation history</h2>
            <div className="table-wrap">
              <table style={{ minWidth: '540px' }}>
                <thead>
                  <tr>
                    <th scope="col">Booking</th>
                    <th scope="col">Plate</th>
                    <th scope="col">Slot</th>
                    <th scope="col">Floor</th>
                    <th scope="col">Reserved At</th>
                    <th scope="col" className="num">
                      Paid
                    </th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((r) => {
                    const isActive = r.minutesRemaining > 0;
                    return (
                      <tr key={r.id}>
                        <td className="mono">#{r.ticketNo}</td>
                        <td className="mono">{r.plate}</td>
                        <td style={{ fontWeight: 600 }}>{r.slot}</td>
                        <td>{r.floor}</td>
                        <td className="muted">{formatTime24(r.createdAt)}</td>
                        <td className="num">
                          <b>{formatCurrency(r.amount)}</b>
                        </td>
                        <td>
                          {isActive ? (
                            <StatusBadge status="Reserved" tone="amber" />
                          ) : (
                            <StatusBadge status="Completed / Expired" tone="navy" />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {/* ADVANCE BOOKING PAYMENT MODAL */}
      {payModalOpen && selectedVehicle && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClosePayModal();
          }}
        >
          <div
            ref={modalRef}
            className="modal-sheet stack-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="book-pay-title"
          >
            <div className="row between" style={{ flexWrap: 'nowrap' }}>
              <div className="stack" style={{ gap: '4px' }}>
                <Badge tone="amber">
                  Demo payment: no real money is charged
                </Badge>
                <h2 id="book-pay-title" style={{ fontSize: '20px' }}>
                  Pay to confirm booking
                </h2>
              </div>
              <button
                type="button"
                className="btn"
                disabled={booking}
                onClick={handleClosePayModal}
                aria-label="Close payment sheet"
              >
                Close
              </button>
            </div>

            <dl className="kv">
              <div>
                <dt>Vehicle</dt>
                <dd className="mono">
                  {selectedVehicle.plate} ({selectedVehicle.type})
                </dd>
              </div>
              <div>
                <dt>Preference</dt>
                <dd>
                  {specificSlot
                    ? `Bay ${specificSlot}`
                    : `${prefFloor === 'Any' ? 'Any floor' : prefFloor} · ${prefKind === 'ANY' ? 'Any bay type' : prefKind}`}
                </dd>
              </div>
              <div>
                <dt>Hold window</dt>
                <dd>{durationLabel(duration)}</dd>
              </div>
            </dl>

            <div className="total-row">
              <span style={{ fontWeight: 600, fontSize: '14px' }}>
                Amount due
              </span>
              <dd style={{ margin: 0 }}>{formatCurrency(bookingFee)}</dd>
            </div>

            <div className="field">
              <span className="lbl" id="lbl-book-method">
                Payment method
              </span>
              <Segmented
                id="book-methods"
                ariaLabelledby="lbl-book-method"
                options={PAY_METHODS}
                value={method}
                onChange={setMethod}
              />
            </div>

            <label className="check-row" htmlFor="book-sim-fail">
              <input
                id="book-sim-fail"
                type="checkbox"
                checked={simulateFail}
                disabled={booking}
                onChange={(e) => {
                  setSimulateFail(e.target.checked);
                  setPayErr('');
                }}
              />
              <span>Simulate a failed payment (demo)</span>
            </label>

            {payErr && (
              <div className="err" role="alert">
                {payErr}
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={booking}
              onClick={handleConfirmAndPay}
            >
              {booking ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Processing payment…
                </>
              ) : (
                `Pay ${formatCurrency(bookingFee)} & confirm booking`
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
