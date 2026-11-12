import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { get, post, del } from '../api';
import { formatTime24 } from '../format';
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

  const [booking, setBooking] = useState(false);
  const [bookErr, setBookErr] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

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
        // Pick first vehicle not already in lot or booked
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

  const selectedVehicle = vehicles.find((v) => v.plate === selectedPlate);

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

  const handleBook = async (e) => {
    e.preventDefault();
    if (booking || !selectedPlate) return;

    setBooking(true);
    setBookErr('');
    setSuccessNotice('');

    try {
      const res = await post('/api/me/reservations', {
        plate: selectedPlate,
        floor: prefFloor,
        kind: prefKind,
        slotCode: specificSlot || undefined,
        holdMinutes: Number(duration)
      });

      setSuccessNotice(
        `Slot ${res.slot} on ${res.floor} successfully reserved for ${res.plate}!`
      );
      setSpecificSlot('');
      setShowBayPicker(false);
      await loadData();
    } catch (err) {
      setBookErr(err.message || 'Could not complete advance booking.');
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
                    <small>Reserved at</small>
                    <span>{formatTime24(r.createdAt)}</span>
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
                Select your vehicle and preferences. The bay is held exclusively for you.
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
            <form className="stack-lg" onSubmit={handleBook}>
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
                          <small>
                            {v.type} · {v.plan}
                          </small>
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

              {/* Plan info callout */}
              {selectedVehicle && (
                <div
                  className="card"
                  style={{
                    background:
                      selectedVehicle.rawPlan === 'MONTHLY'
                        ? 'var(--teal-t)'
                        : 'var(--bg)',
                    border: '1px solid var(--line)',
                    padding: '14px 16px'
                  }}
                >
                  <div className="row between">
                    <div>
                      <strong style={{ fontSize: '14px' }}>
                        Subscription Plan: {selectedVehicle.plan}
                      </strong>
                      <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                        {selectedVehicle.rawPlan === 'MONTHLY'
                          ? 'Unlimited parking included at ₹0 hourly fee with your Monthly pass.'
                          : 'Standard hourly tariff applies upon gate exit.'}
                      </p>
                    </div>
                    <Link
                      to="/my-vehicles"
                      style={{ fontSize: '13px', color: 'var(--teal-d)', fontWeight: 600 }}
                    >
                      Change plan →
                    </Link>
                  </div>
                </div>
              )}

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
                  The slot will be kept reserved for this duration from now.
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
                        No free bays matching this floor/kind combination right now. You can still select "Any floor" or "Auto-allocate".
                      </p>
                    ) : (
                      <div className="slot-grid" style={{ maxHeight: '180px', overflowY: 'auto' }}>
                        {filteredSlots.map((s) => {
                          const isPicked = specificSlot === s.code;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className={`slot free`}
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

              {bookErr && (
                <div className="err" role="alert">
                  {bookErr}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg btn-block"
                disabled={booking || !selectedPlate}
              >
                {booking ? 'Reserving slot…' : `Confirm Advance Booking for ${selectedPlate}`}
              </button>
            </form>
          )}
        </section>

        {/* RECENT BOOKING HISTORY */}
        {reservations.length > 0 && (
          <section className="card stack" aria-label="Reservation history">
            <h2 style={{ fontSize: '18px' }}>Your reservation history</h2>
            <div className="table-wrap">
              <table style={{ minWidth: '480px' }}>
                <thead>
                  <tr>
                    <th scope="col">Booking</th>
                    <th scope="col">Plate</th>
                    <th scope="col">Slot</th>
                    <th scope="col">Floor</th>
                    <th scope="col">Reserved At</th>
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
                        <td>
                          {isActive ? (
                            <StatusBadge status="Reserved" tone="amber" />
                          ) : (
                            <StatusBadge status="Completed / Expired" tone="muted" />
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
    </>
  );
}

