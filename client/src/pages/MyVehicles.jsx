import React, { useEffect, useState, useCallback, useRef } from 'react';
import { get, post, patch } from '../api';
import StatusBadge from '../components/StatusBadge';
import Badge from '../components/Badge';
import Segmented from '../components/Segmented';

const VEHICLE_TYPES = ['Bike', 'Car', 'SUV'];

export default function MyVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Plan Change Modal State
  const [planModalOpen, setPlanModalOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [chosenPlan, setChosenPlan] = useState('PAY_PER_HOUR');
  const [updatingPlan, setUpdatingPlan] = useState(false);
  const [planError, setPlanError] = useState('');

  // New Vehicle Modal State
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [newPlate, setNewPlate] = useState('');
  const [newType, setNewType] = useState('Car');
  const [newPlan, setNewPlan] = useState('PAY_PER_HOUR');
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState('');

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

  // Open Plan Switcher
  const handleOpenPlanModal = (veh) => {
    setSelectedVehicle(veh);
    setChosenPlan(veh.rawPlan || (veh.plan === 'Monthly pass' ? 'MONTHLY' : 'PAY_PER_HOUR'));
    setPlanError('');
    setPlanModalOpen(true);
  };

  // Submit Plan Switch
  const handleUpdatePlan = async () => {
    if (updatingPlan || !selectedVehicle) return;
    setUpdatingPlan(true);
    setPlanError('');

    try {
      const res = await patch(`/api/me/vehicles/${encodeURIComponent(selectedVehicle.plate)}/plan`, {
        plan: chosenPlan
      });
      setNotice(`${selectedVehicle.plate} plan changed to ${res.plan}.`);
      setPlanModalOpen(false);
      await load();
    } catch (err) {
      setPlanError(err.message || 'Failed to update plan.');
    } finally {
      setUpdatingPlan(false);
    }
  };

  // Submit New Vehicle Registration
  const handleRegisterVehicle = async (e) => {
    e.preventDefault();
    if (registering) return;

    const trimmed = newPlate.trim().toUpperCase();
    if (!trimmed) {
      setRegError('Please enter a vehicle plate number.');
      return;
    }

    setRegistering(true);
    setRegError('');

    try {
      const res = await post('/api/me/vehicles', {
        plate: trimmed,
        type: newType,
        plan: newPlan
      });
      setNotice(`Vehicle ${res.plate} (${res.type}) registered with ${res.plan}!`);
      setRegModalOpen(false);
      setNewPlate('');
      setNewType('Car');
      setNewPlan('PAY_PER_HOUR');
      await load();
    } catch (err) {
      setRegError(err.message || 'Failed to register vehicle.');
    } finally {
      setRegistering(false);
    }
  };

  return (
    <>
      <header className="head">
        <div>
          <h1>My vehicles &amp; Plans</h1>
          <p className="sub">
            Manage your registered vehicles, check parking status, and choose your subscription plans online.
          </p>
        </div>
        <div className="row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setRegError('');
              setRegModalOpen(true);
            }}
          >
            + Register vehicle
          </button>
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

        {/* PLAN INFORMATION CARDS */}
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
              <span className="badge b-navy" style={{ fontSize: '13px' }}>
                Standard Plan
              </span>
              <strong style={{ fontSize: '18px' }}>Pay per hour</strong>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--muted)' }}>
              Pay only for the time you stay. First hour standard rate + incremental extra hourly rate.
              Convenient for occasional visits and visitors.
            </p>
            <div className="notice" style={{ padding: '8px 12px', fontSize: '12px' }}>
              ✓ Transparent hourly billing &nbsp;·&nbsp; ✓ Pay on exit or in-app
            </div>
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
              <span className="badge b-teal" style={{ fontSize: '13px' }}>
                Subscription Plan
              </span>
              <strong style={{ fontSize: '18px', color: 'var(--teal-d)' }}>
                Monthly pass
              </strong>
            </div>
            <p style={{ margin: 0, fontSize: '13px', color: 'var(--ink)' }}>
              Unlimited parking with <b>₹0 hourly parking fees</b>. Zero gate exit charges on every parking session across all floors.
            </p>
            <div
              className="notice"
              style={{
                background: 'rgba(94, 234, 212, 0.25)',
                color: 'var(--teal-d)',
                padding: '8px 12px',
                fontSize: '12px'
              }}
            >
              ★ Unlimited entries &nbsp;·&nbsp; ★ ₹0 exit fee &nbsp;·&nbsp; ★ Priority advance booking
            </div>
          </div>
        </div>

        {loading ? (
          <p className="muted">Loading your vehicles…</p>
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
            <div className="row between">
              <h2>Your vehicles ({vehicles.length})</h2>
              <span className="hint">
                Click "Change plan" to switch between Pay per hour and Monthly pass anytime online.
              </span>
            </div>

            <div className="table-wrap">
              <table style={{ minWidth: '600px' }}>
                <thead>
                  <tr>
                    <th scope="col">Plate</th>
                    <th scope="col">Type</th>
                    <th scope="col">Current Plan</th>
                    <th scope="col" className="num">
                      Visits
                    </th>
                    <th scope="col">Current status</th>
                    <th scope="col" style={{ textAlign: 'right' }}>
                      Subscription
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => {
                    const isMonthly =
                      v.rawPlan === 'MONTHLY' || v.plan === 'Monthly pass';
                    return (
                      <tr key={v.plate}>
                        <td className="mono" style={{ fontWeight: 600 }}>
                          {v.plate}
                        </td>
                        <td>{v.type}</td>
                        <td>
                          <Badge tone={isMonthly ? 'teal' : 'navy'}>
                            {isMonthly ? '★ Monthly pass' : 'Pay per hour'}
                          </Badge>
                        </td>
                        <td className="num">{v.visits}</td>
                        <td>
                          {v.slot ? (
                            <StatusBadge
                              status={`Parked · ${v.slot}`}
                              tone="navy"
                            />
                          ) : v.inLot ? (
                            <StatusBadge status="Parked" tone="navy" />
                          ) : (
                            <span className="muted">Not in lot</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn"
                            style={{
                              fontSize: '13px',
                              minHeight: '34px',
                              padding: '0 12px'
                            }}
                            onClick={() => handleOpenPlanModal(v)}
                          >
                            Change plan
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {vehicles.length === 0 && (
              <div className="empty stack">
                <p>No vehicles found on your account.</p>
                <div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setRegModalOpen(true)}
                  >
                    + Register your first vehicle
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {/* PLAN SWITCHER MODAL */}
      {planModalOpen && selectedVehicle && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !updatingPlan) {
              setPlanModalOpen(false);
            }
          }}
        >
          <div
            className="modal-sheet stack-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-modal-title"
          >
            <div className="row between" style={{ flexWrap: 'nowrap' }}>
              <div>
                <h2 id="plan-modal-title" style={{ fontSize: '20px' }}>
                  Choose Plan for {selectedVehicle.plate}
                </h2>
                <p className="sub" style={{ fontSize: '13px' }}>
                  {selectedVehicle.type} · Select an online plan
                </p>
              </div>
              <button
                type="button"
                className="btn"
                disabled={updatingPlan}
                onClick={() => setPlanModalOpen(false)}
              >
                Close
              </button>
            </div>

            <div className="stack" style={{ gap: '12px' }}>
              {/* Option 1: PAY_PER_HOUR */}
              <label
                className="pick"
                style={{
                  cursor: 'pointer',
                  borderColor:
                    chosenPlan === 'PAY_PER_HOUR' ? 'var(--navy)' : 'var(--line)',
                  background:
                    chosenPlan === 'PAY_PER_HOUR' ? 'var(--occ-t)' : '#fff'
                }}
              >
                <div className="row" style={{ gap: '12px', alignItems: 'flex-start' }}>
                  <input
                    type="radio"
                    name="vehicle-plan"
                    value="PAY_PER_HOUR"
                    checked={chosenPlan === 'PAY_PER_HOUR'}
                    onChange={() => setChosenPlan('PAY_PER_HOUR')}
                    style={{ marginTop: '4px', width: '18px', height: '18px' }}
                  />
                  <div className="l">
                    <strong style={{ fontSize: '15px' }}>Pay per hour</strong>
                    <small>
                      Standard rate per visit based on duration. No recurring charge.
                    </small>
                  </div>
                </div>
                <div className="r">
                  <Badge tone="navy">Flexible</Badge>
                </div>
              </label>

              {/* Option 2: MONTHLY */}
              <label
                className="pick"
                style={{
                  cursor: 'pointer',
                  borderColor:
                    chosenPlan === 'MONTHLY' ? 'var(--teal)' : 'var(--line)',
                  background:
                    chosenPlan === 'MONTHLY' ? 'var(--teal-t)' : '#fff'
                }}
              >
                <div className="row" style={{ gap: '12px', alignItems: 'flex-start' }}>
                  <input
                    type="radio"
                    name="vehicle-plan"
                    value="MONTHLY"
                    checked={chosenPlan === 'MONTHLY'}
                    onChange={() => setChosenPlan('MONTHLY')}
                    style={{ marginTop: '4px', width: '18px', height: '18px' }}
                  />
                  <div className="l">
                    <strong style={{ fontSize: '15px', color: 'var(--teal-d)' }}>
                      Monthly pass
                    </strong>
                    <small>
                      Unlimited access across all floors with ₹0 hourly exit fees.
                    </small>
                  </div>
                </div>
                <div className="r">
                  <Badge tone="teal">★ ₹0 Exit Fee</Badge>
                </div>
              </label>
            </div>

            {planError && (
              <div className="err" role="alert">
                {planError}
              </div>
            )}

            <div className="row between">
              <button
                type="button"
                className="btn"
                disabled={updatingPlan}
                onClick={() => setPlanModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={updatingPlan}
                onClick={handleUpdatePlan}
              >
                {updatingPlan ? 'Updating plan…' : 'Save plan change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEW VEHICLE REGISTRATION MODAL */}
      {regModalOpen && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !registering) {
              setRegModalOpen(false);
            }
          }}
        >
          <div
            className="modal-sheet stack-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reg-modal-title"
          >
            <div className="row between" style={{ flexWrap: 'nowrap' }}>
              <div>
                <h2 id="reg-modal-title" style={{ fontSize: '20px' }}>
                  Register a new vehicle
                </h2>
                <p className="sub" style={{ fontSize: '13px' }}>
                  Add a car or bike to your account and choose its plan.
                </p>
              </div>
              <button
                type="button"
                className="btn"
                disabled={registering}
                onClick={() => setRegModalOpen(false)}
              >
                Close
              </button>
            </div>

            <form className="stack-lg" onSubmit={handleRegisterVehicle}>
              <div className="field">
                <label htmlFor="reg-plate">Plate number</label>
                <input
                  id="reg-plate"
                  className="input mono"
                  type="text"
                  placeholder="HR 26 DQ 5521"
                  autoFocus
                  value={newPlate}
                  onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                  required
                />
              </div>

              <div className="field">
                <span className="lbl">Vehicle type</span>
                <Segmented
                  id="reg-type"
                  options={VEHICLE_TYPES}
                  value={newType}
                  onChange={setNewType}
                />
              </div>

              <div className="field">
                <span className="lbl">Choose subscription plan</span>
                <div className="stack" style={{ gap: '10px' }}>
                  <label
                    className="pick"
                    style={{
                      cursor: 'pointer',
                      borderColor:
                        newPlan === 'PAY_PER_HOUR' ? 'var(--navy)' : 'var(--line)',
                      background:
                        newPlan === 'PAY_PER_HOUR' ? 'var(--occ-t)' : '#fff'
                    }}
                  >
                    <div className="row" style={{ gap: '10px' }}>
                      <input
                        type="radio"
                        name="reg-plan"
                        value="PAY_PER_HOUR"
                        checked={newPlan === 'PAY_PER_HOUR'}
                        onChange={() => setNewPlan('PAY_PER_HOUR')}
                      />
                      <div className="l">
                        <strong>Pay per hour</strong>
                        <small>Standard hourly tariff on exit</small>
                      </div>
                    </div>
                  </label>

                  <label
                    className="pick"
                    style={{
                      cursor: 'pointer',
                      borderColor:
                        newPlan === 'MONTHLY' ? 'var(--teal)' : 'var(--line)',
                      background:
                        newPlan === 'MONTHLY' ? 'var(--teal-t)' : '#fff'
                    }}
                  >
                    <div className="row" style={{ gap: '10px' }}>
                      <input
                        type="radio"
                        name="reg-plan"
                        value="MONTHLY"
                        checked={newPlan === 'MONTHLY'}
                        onChange={() => setNewPlan('MONTHLY')}
                      />
                      <div className="l">
                        <strong style={{ color: 'var(--teal-d)' }}>
                          Monthly pass
                        </strong>
                        <small>Unlimited parking with ₹0 hourly exit fees</small>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {regError && (
                <div className="err" role="alert">
                  {regError}
                </div>
              )}

              <div className="row between">
                <button
                  type="button"
                  className="btn"
                  disabled={registering}
                  onClick={() => setRegModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={registering}
                >
                  {registering ? 'Registering…' : 'Register vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
