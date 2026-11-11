const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/index');
const pool = require('../src/db');

let server;
let baseUrl;

before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end();
});

async function cleanTestPlates(prefix) {
  const { rows: sessions } = await pool.query(
    `SELECT session_id, slot_id FROM parking_session WHERE plate_no LIKE $1`,
    [prefix + '%']
  );
  if (sessions.length > 0) {
    const sids = sessions.map((s) => s.session_id);
    const slotIds = sessions.map((s) => s.slot_id);
    await pool.query(`DELETE FROM payment WHERE session_id = ANY($1::INT[])`, [sids]);
    await pool.query(`DELETE FROM parking_session WHERE session_id = ANY($1::INT[])`, [sids]);
    await pool.query(
      `UPDATE slot s
          SET status = 'FREE'
        WHERE s.slot_id = ANY($1::INT[])
          AND NOT EXISTS (
            SELECT 1 FROM parking_session ps
             WHERE ps.slot_id = s.slot_id AND ps.exit_time IS NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM reservation r
             WHERE r.slot_id = s.slot_id
          )`,
      [slotIds]
    );
  }
  await pool.query(`DELETE FROM vehicle WHERE plate_no LIKE $1`, [prefix + '%']);
  await pool.query(`DELETE FROM owner WHERE phone LIKE '9000999%'`);
}

describe('ParkSmart API', () => {
  it('GET /api/dashboard returns expected shape', async () => {
    const res = await fetch(`${baseUrl}/api/dashboard`);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.ok(Array.isArray(body.floors));
    assert.equal(body.floors.length, 3);
    for (const f of body.floors) {
      assert.equal(typeof f.name, 'string');
      assert.equal(typeof f.total, 'number');
      assert.equal(typeof f.occupied, 'number');
      assert.equal(typeof f.reserved, 'number');
    }
    assert.equal(typeof body.revenueToday, 'number');
    assert.equal(typeof body.completedToday, 'number');
    assert.equal(typeof body.avgStayMinutes, 'number');
    assert.ok(Array.isArray(body.entriesByHour));
    assert.equal(body.entriesByHour.length, 15);
    assert.equal(body.entriesByHour[0].hour, 6);
    assert.equal(body.entriesByHour[14].hour, 20);
    assert.ok(Array.isArray(body.activity));
    assert.ok(body.activity.length <= 5);
    assert.ok(Array.isArray(body.alerts));
  });

  it('GET /api/floors, /api/slots, /api/slots/:code, /api/tariff, /api/sessions/active, /api/vehicles, /api/billing/summary, /api/payments return expected shapes', async () => {
    const floorsRes = await fetch(`${baseUrl}/api/floors`);
    assert.equal(floorsRes.status, 200);
    const floors = await floorsRes.json();
    assert.equal(floors.length, 3);
    assert.deepEqual(floors[0], { code: 'G', name: 'Ground floor' });

    const slotsRes = await fetch(`${baseUrl}/api/slots?floor=G`);
    assert.equal(slotsRes.status, 200);
    const slotsBody = await slotsRes.json();
    assert.deepEqual(slotsBody.floor, { code: 'G', name: 'Ground floor' });
    assert.equal(slotsBody.slots.length, 60);

    const slotDetailRes = await fetch(`${baseUrl}/api/slots/L1-14`);
    assert.equal(slotDetailRes.status, 200);
    const slotDetail = await slotDetailRes.json();
    assert.equal(slotDetail.code, 'L1-14');
    assert.equal(slotDetail.floor, 'Level 1');
    assert.equal(slotDetail.status, 'OCCUPIED');
    assert.equal(slotDetail.plate, 'HR 06 AK 4821');

    const tariffRes = await fetch(`${baseUrl}/api/tariff`);
    assert.equal(tariffRes.status, 200);
    const tariff = await tariffRes.json();
    assert.equal(tariff.length, 3);
    assert.deepEqual(tariff[0], { type: 'Bike', first: 15, extra: 10 });

    const activeRes = await fetch(`${baseUrl}/api/sessions/active`);
    assert.equal(activeRes.status, 200);
    const active = await activeRes.json();
    assert.ok(Array.isArray(active));
    assert.ok(active.length > 0);
    assert.ok('id' in active[0] && 'plate' in active[0] && 'slot' in active[0] && 'minutes' in active[0]);

    const vehiclesRes = await fetch(`${baseUrl}/api/vehicles?q=Aarav&plan=Monthly%20pass`);
    assert.equal(vehiclesRes.status, 200);
    const vehiclesBody = await vehiclesRes.json();
    assert.equal(typeof vehiclesBody.total, 'number');
    assert.equal(vehiclesBody.vehicles.length, 1);
    assert.equal(vehiclesBody.vehicles[0].plate, 'HR 06 AK 4821');

    const summaryRes = await fetch(`${baseUrl}/api/billing/summary`);
    assert.equal(summaryRes.status, 200);
    const summary = await summaryRes.json();
    assert.equal(typeof summary.collectedToday, 'number');
    assert.equal(summary.revenueByDay.length, 7);
    assert.equal(summary.methodMix.length, 3);

    const paymentsRes = await fetch(`${baseUrl}/api/payments?status=Pending`);
    assert.equal(paymentsRes.status, 200);
    const payments = await paymentsRes.json();
    assert.ok(payments.length >= 2);
    assert.equal(payments[0].method, 'Not chosen');
    assert.equal(payments[0].status, 'Pending');
  });

  it('Entry -> Bill -> Exit round trip and exit of already-exited session (404)', async () => {
    await cleanTestPlates('TS 01 RT');
    try {
      const entryRes = await fetch(`${baseUrl}/api/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: 'ts 01   rt 1001', type: 'Car', floor: 'Any' })
      });
      assert.equal(entryRes.status, 201);
      const ticket = await entryRes.json();
      assert.equal(ticket.plate, 'TS 01 RT 1001');
      assert.ok(ticket.ticketNo.startsWith('T-'));
      assert.equal(ticket.tariff.first, 40);
      assert.equal(ticket.tariff.extra, 30);

      const sessionId = Number(ticket.ticketNo.slice(2));

      // Double entry for the same plate -> 409
      const dupEntryRes = await fetch(`${baseUrl}/api/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: 'TS 01 RT 1001', type: 'Car', floor: 'Any' })
      });
      assert.equal(dupEntryRes.status, 409);
      const dupEntryErr = await dupEntryRes.json();
      assert.equal(dupEntryErr.error, 'That vehicle is already in the lot.');

      // Bill preview
      const billRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/bill`);
      assert.equal(billRes.status, 200);
      const bill = await billRes.json();
      assert.equal(bill.plate, 'TS 01 RT 1001');
      assert.equal(bill.slot, ticket.slot);
      assert.equal(bill.hours, 1);
      assert.equal(bill.first, 40);
      assert.equal(bill.extraHours, 0);
      assert.equal(bill.total, 40);

      // Exit
      const exitRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'UPI' })
      });
      assert.equal(exitRes.status, 200);
      const receipt = await exitRes.json();
      assert.equal(receipt.amount, 40);
      assert.equal(receipt.method, 'UPI');
      assert.equal(receipt.slot, ticket.slot);
      assert.equal(receipt.plate, 'TS 01 RT 1001');

      // Exit of already-exited session -> 404
      const secondExitRes = await fetch(`${baseUrl}/api/sessions/${sessionId}/exit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: 'UPI' })
      });
      assert.equal(secondExitRes.status, 404);
      const secondExitErr = await secondExitRes.json();
      assert.equal(secondExitErr.error, 'That vehicle is not in the lot.');
    } finally {
      await cleanTestPlates('TS 01 RT');
    }
  });

  it('Vehicle registration: valid create (201), duplicate plate (409), invalid phone (422)', async () => {
    await cleanTestPlates('TS 01 VH');
    try {
      const badPhoneRes = await fetch(`${baseUrl}/api/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: 'TS 01 VH 2001',
          type: 'Car',
          owner: 'Test Owner',
          phone: '12345'
        })
      });
      assert.equal(badPhoneRes.status, 422);
      const badPhoneBody = await badPhoneRes.json();
      assert.equal(badPhoneBody.error, 'Enter a 10-digit mobile number.');

      const createRes = await fetch(`${baseUrl}/api/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: 'TS 01 VH 2001',
          type: 'SUV',
          owner: 'Test Owner',
          phone: '9000999001'
        })
      });
      assert.equal(createRes.status, 201);
      const created = await createRes.json();
      assert.equal(created.plate, 'TS 01 VH 2001');
      assert.equal(created.type, 'SUV');
      assert.equal(created.plan, 'Pay per hour');
      assert.equal(created.visits, 0);
      assert.equal(created.last, 'Never');

      const dupVehRes = await fetch(`${baseUrl}/api/vehicles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plate: 'TS 01 VH 2001',
          type: 'SUV',
          owner: 'Another Name',
          phone: '9000999002'
        })
      });
      assert.equal(dupVehRes.status, 409);
      const dupVehBody = await dupVehRes.json();
      assert.equal(dupVehBody.error, 'This plate is already registered.');
    } finally {
      await cleanTestPlates('TS 01 VH');
    }
  });

  it('Full floor returns 409 and concurrency test allocates exactly 5 free slots to 20 simultaneous requests', async () => {
    await cleanTestPlates('TS 01 CC');

    // Find all currently FREE slots on Ground floor (floor_id = 1)
    const { rows: freeGround } = await pool.query(
      `SELECT slot_id, slot_code FROM slot WHERE floor_id = 1 AND status = 'FREE' ORDER BY slot_no`
    );

    // Temporarily set all FREE slots on Ground floor to MAINTENANCE, then open 5 slots on Ground floor
    // If Ground floor has fewer than 5 free slots, also temporarily borrow occupied/reserved slots or use L2
    const { rows: freeL2 } = await pool.query(
      `SELECT slot_id, slot_code FROM slot WHERE floor_id = 3 AND status = 'FREE' ORDER BY slot_no`
    );
    assert.ok(freeL2.length >= 5, 'Expected at least 5 free slots on Level 2');

    const extraL2Ids = freeL2.slice(5).map((s) => s.slot_id);
    if (extraL2Ids.length > 0) {
      await pool.query(
        `UPDATE slot SET status = 'MAINTENANCE' WHERE slot_id = ANY($1::INT[])`,
        [extraL2Ids]
      );
    }

    try {
      // Fire 20 simultaneous POST /api/entry requests onto Level 2 (which now has exactly 5 FREE slots)
      const requests = Array.from({ length: 20 }, (_, idx) => {
        const plate = `TS 01 CC ${3000 + idx}`;
        return fetch(`${baseUrl}/api/entry`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plate, type: 'Car', floor: 'L2' })
        }).then(async (r) => ({ status: r.status, body: await r.json() }));
      });

      const results = await Promise.all(requests);
      const successes = results.filter((r) => r.status === 201);
      const conflicts = results.filter((r) => r.status === 409);

      assert.equal(successes.length, 5, `Expected 5 successes (201), got ${successes.length}`);
      assert.equal(conflicts.length, 15, `Expected 15 conflicts (409), got ${conflicts.length}`);

      const allocatedSlots = successes.map((r) => r.body.slot);
      const uniqueSlots = new Set(allocatedSlots);
      assert.equal(uniqueSlots.size, 5, 'No slot may appear twice');

      for (const c of conflicts) {
        assert.equal(c.body.error, 'No free slot on that floor. Try another floor.');
      }

      // Now Level 2 is completely full (0 free slots) -> one more entry must return 409
      const fullRes = await fetch(`${baseUrl}/api/entry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate: 'TS 01 CC 3999', type: 'Car', floor: 'L2' })
      });
      assert.equal(fullRes.status, 409);
      const fullBody = await fullRes.json();
      assert.equal(fullBody.error, 'No free slot on that floor. Try another floor.');
    } finally {
      if (extraL2Ids.length > 0) {
        await pool.query(
          `UPDATE slot SET status = 'FREE' WHERE slot_id = ANY($1::INT[])`,
          [extraL2Ids]
        );
      }
      await cleanTestPlates('TS 01 CC');
    }
  });
});
