import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { get } from '../api';
import {
  formatCurrency,
  formatDuration,
  formatTime24,
  formatTitleWord
} from '../format';
import Segmented from '../components/Segmented';
import StatusBadge from '../components/StatusBadge';

function slotTag(s) {
  if (s.kind === 'EV') return 'EV';
  if (s.kind === 'ACCESSIBLE') return 'ACC';
  if (s.status === 'FREE') return 'free';
  if (s.status === 'OCCUPIED') return 'busy';
  return 'held';
}

function formatEnteredAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const isYesterday = d.toDateString() !== now.toDateString();
  return formatTime24(d) + (isYesterday ? ' (yesterday)' : '');
}

export default function Slots() {
  const [floors, setFloors] = useState([]);
  const [floorCode, setFloorCode] = useState('G');
  const [floorData, setFloorData] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFloor = useCallback(async (code) => {
    try {
      setError('');
      const [floorsList, slotsRes] = await Promise.all([
        floors.length ? Promise.resolve(floors) : get('/api/floors'),
        get(`/api/slots?floor=${encodeURIComponent(code)}`)
      ]);
      if (!floors.length) {
        setFloors(floorsList);
      }
      setFloorData(slotsRes);

      const firstFree =
        slotsRes.slots.find((s) => s.status === 'FREE') || slotsRes.slots[0];
      if (firstFree) {
        setSelectedCode(firstFree.code);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }, [floors]);

  useEffect(() => {
    loadFloor(floorCode);
  }, [floorCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedCode) return;
    let cancelled = false;
    get(`/api/slots/${encodeURIComponent(selectedCode)}`)
      .then((res) => {
        if (!cancelled) setDetail(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Something went wrong. Try again.');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCode]);

  const handleFloorChange = (newCode) => {
    setFloorCode(newCode);
  };

  if (loading && !floorData) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Slots</h1>
            <p className="sub">
              Pick a floor, then select a slot to see who is parked there.
            </p>
          </div>
        </header>
        <p className="muted">Loading…</p>
      </>
    );
  }

  if (error && !floorData) {
    return (
      <>
        <header className="head">
          <div>
            <h1>Slots</h1>
            <p className="sub">
              Pick a floor, then select a slot to see who is parked there.
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
              onClick={() => loadFloor(floorCode)}
            >
              Try again
            </button>
          </div>
        </div>
      </>
    );
  }

  const slots = floorData ? floorData.slots : [];
  const counts = { FREE: 0, OCCUPIED: 0, RESERVED: 0 };
  slots.forEach((s) => {
    if (counts[s.status] !== undefined) counts[s.status]++;
  });

  const activeSlot =
    detail && detail.code === selectedCode
      ? detail
      : slots.find((s) => s.code === selectedCode) || slots[0];

  const detailRows = [];
  if (activeSlot) {
    detailRows.push(['Floor', floorData.floor.name]);
    detailRows.push(['Bay type', formatTitleWord(activeSlot.kind)]);
    detailRows.push(['Status', formatTitleWord(activeSlot.status)]);
    if (activeSlot.status === 'OCCUPIED') {
      detailRows.push([
        'Vehicle',
        <span className="mono" key="veh">
          {detail?.plate || '—'}
        </span>
      ]);
      detailRows.push([
        'Entered at',
        detail?.enteredAt ? formatEnteredAt(detail.enteredAt) : '—'
      ]);
      detailRows.push([
        'Parked for',
        detail?.minutes != null ? formatDuration(detail.minutes) : '—'
      ]);
      detailRows.push([
        'Fee so far',
        detail?.fee != null ? formatCurrency(detail.fee) : '—'
      ]);
    } else if (activeSlot.status === 'RESERVED') {
      detailRows.push([
        'Held for',
        <span className="mono" key="held">
          {detail?.heldFor || '—'}
        </span>
      ]);
      detailRows.push([
        'Hold ends',
        detail?.holdEndsAt ? formatTime24(detail.holdEndsAt) : '—'
      ]);
    } else {
      detailRows.push(['Ready for', 'Next arrival']);
    }
  }

  return (
    <>
      <header className="head">
        <div>
          <h1>Slots</h1>
          <p className="sub">
            Pick a floor, then select a slot to see who is parked there.
          </p>
        </div>
        <Segmented
          id="tabs"
          ariaLabel="Floor"
          options={floors.map((f) => ({ value: f.code, label: f.name }))}
          value={floorCode}
          onChange={handleFloorChange}
        />
      </header>

      <div className="stack-lg">
        <section className="row" aria-label="Floor summary" id="legend">
          <div className="chip-count">
            <i
              className="dot"
              style={{ background: '#E6F4F2', border: '2px solid #0B7A75' }}
            />
            <b>{counts.FREE}</b>
            <span className="muted">free</span>
          </div>
          <div className="chip-count">
            <i className="dot" style={{ background: '#1E3A5F' }} />
            <b>{counts.OCCUPIED}</b>
            <span className="muted">occupied</span>
          </div>
          <div className="chip-count">
            <i
              className="dot"
              style={{ background: '#FDE9B8', border: '2px dashed #B45309' }}
            />
            <b>{counts.RESERVED}</b>
            <span className="muted">reserved</span>
          </div>
          <span className="hint" style={{ padding: '0 4px' }}>
            EV = charging bay · ACC = accessible bay
          </span>
        </section>

        <div className="split">
          <section className="card stack grow" aria-label="Slot grid">
            <h2 id="floor-title">{floorData.floor.name}</h2>
            <div className="slot-grid" id="grid">
              {slots.map((s) => {
                const label =
                  `Slot ${s.code}, ${s.status.toLowerCase()}` +
                  (s.kind === 'REGULAR' ? '' : `, ${formatTitleWord(s.kind)}`);
                return (
                  <button
                    key={s.code}
                    type="button"
                    className={`slot ${s.status.toLowerCase()}`}
                    aria-label={label}
                    aria-pressed={s.code === selectedCode}
                    onClick={() => setSelectedCode(s.code)}
                  >
                    <span>{s.number}</span>
                    <small>{slotTag(s)}</small>
                  </button>
                );
              })}
            </div>
          </section>

          {activeSlot && (
            <aside
              className="card stack rail"
              aria-label="Slot detail"
              aria-live="polite"
            >
              <div className="row between" style={{ flexWrap: 'nowrap' }}>
                <div
                  id="d-code"
                  style={{ font: "700 28px 'Space Grotesk',sans-serif" }}
                >
                  {activeSlot.code}
                </div>
                <StatusBadge status={activeSlot.status} id="d-chip" />
              </div>
              <dl className="kv" id="d-rows">
                {detailRows.map(([dt, dd]) => (
                  <div key={dt}>
                    <dt>{dt}</dt>
                    <dd>{dd}</dd>
                  </div>
                ))}
              </dl>
              {activeSlot.status === 'FREE' && (
                <Link className="btn btn-primary" id="d-free" to="/entry-exit">
                  Assign a vehicle here
                </Link>
              )}
              {activeSlot.status === 'OCCUPIED' && (
                <Link className="btn" id="d-busy" to="/entry-exit">
                  Go to exit and billing
                </Link>
              )}
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
