# ParkSmart

Smart parking management system for a multi-floor car park, built with PostgreSQL 15+, Node.js/Express, and React + Vite.

## Setup Steps (Windows with pgAdmin 4)

### 1. Create the database `parking_db` in pgAdmin 4
1. Open **pgAdmin 4** and connect to your local PostgreSQL server.
2. Right-click **Databases** -> **Create** -> **Database...**.
3. Enter `parking_db` as the Database name and click **Save**.

### 2. Run the database scripts in `db/`
You can either run the files in pgAdmin 4's Query Tool in order:
1. `db/01_schema.sql`
2. `db/02_functions.sql`
3. `db/03_triggers.sql`
4. `db/04_views.sql`
5. `db/05_seed.sql`
6. `db/06_verify.sql`

Or run `db/run_all.sql` from the repository root using `psql`:
```powershell
psql -U postgres -d parking_db -f db/run_all.sql
```

### 3. Configure the backend environment
Copy `server/.env.example` to `server/.env` and set your PostgreSQL password:
```powershell
Copy-Item server/.env.example server/.env
```
Edit `server/.env`:
```env
DATABASE_URL=postgres://postgres:YOUR_PASSWORD@localhost:5432/parking_db
PORT=4000
```

### 4. Start the API server
```powershell
cd server
npm install
npm run dev
```
The API server runs at `http://localhost:4000`. To run the automated API and concurrency tests:
```powershell
npm test
```

### 5. Start the frontend client
Open a second terminal:
```powershell
cd client
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## Where each database concept lives

### 1. Third Normal Form (3NF) Schema & Constraints (`db/01_schema.sql`)
- **Primary Keys & Foreign Keys**:
  - `owner` (`db/01_schema.sql`, lines 20–25)
  - `vehicle_type` (`db/01_schema.sql`, lines 27–30)
  - `tariff` (`db/01_schema.sql`, lines 32–36) — 1:1 with `vehicle_type(type_id)`
  - `vehicle` (`db/01_schema.sql`, lines 38–45) — references `vehicle_type(type_id)` and `owner(owner_id)`
  - `floor` (`db/01_schema.sql`, lines 47–51)
  - `slot` (`db/01_schema.sql`, lines 53–63) — references `floor(floor_id)`
  - `parking_session` (`db/01_schema.sql`, lines 65–72) — references `vehicle(plate_no)` and `slot(slot_id)`
  - `payment` (`db/01_schema.sql`, lines 74–83) — references `parking_session(session_id)`
  - `reservation` (`db/01_schema.sql`, lines 85–92) — references `vehicle(plate_no)` and `slot(slot_id)`
- **`UNIQUE` Constraints**:
  - `owner.phone` (`db/01_schema.sql`, line 23)
  - `vehicle_type.type_name` (`db/01_schema.sql`, line 29)
  - `floor.floor_name` and `floor.code` (`db/01_schema.sql`, lines 49–50)
  - `slot.slot_code` and composite `UNIQUE (floor_id, slot_no)` (`db/01_schema.sql`, lines 56, 62)
  - `payment.session_id` (`db/01_schema.sql`, line 76) — ensures a session is billed/paid at most once
- **`CHECK` Constraints**:
  - `tariff`: `first_hour >= 0`, `extra_hour >= 0` (`db/01_schema.sql`, lines 34–35)
  - `vehicle.plan`: `CHECK (plan IN ('MONTHLY','PAY_PER_HOUR','VISITOR'))` (`db/01_schema.sql`, line 43)
  - `slot.kind`: `CHECK (kind IN ('REGULAR','EV','ACCESSIBLE'))` (`db/01_schema.sql`, line 59)
  - `slot.status`: `CHECK (status IN ('FREE','OCCUPIED','RESERVED','MAINTENANCE'))` (`db/01_schema.sql`, line 61)
  - `parking_session`: `CHECK (exit_time IS NULL OR exit_time > entry_time)` (`db/01_schema.sql`, line 71)
  - `payment`: `amount >= 0`, `method IN ('UPI','CARD','CASH')`, `status IN ('PENDING','PAID','FAILED')` (`db/01_schema.sql`, lines 77–80)
  - `reservation`: `CHECK (expires_at > created_at)` (`db/01_schema.sql`, line 91)

### 2. Indexes & Partial Unique Indexes (`db/01_schema.sql`)
- **Partial Unique Indexes (Active Session Invariants)**:
  - `uq_open_session_per_slot` on `parking_session (slot_id) WHERE exit_time IS NULL` (`db/01_schema.sql`, line 95) — guarantees a slot holds at most one parked vehicle at a time
  - `uq_open_session_per_plate` on `parking_session (plate_no) WHERE exit_time IS NULL` (`db/01_schema.sql`, line 96) — guarantees a vehicle is parked in at most one slot at a time
- **Performance Lookup Indexes**:
  - `idx_slot_floor_status` on `slot (floor_id, status)` (`db/01_schema.sql`, line 99)
  - `idx_session_plate_time` on `parking_session (plate_no, entry_time DESC)` (`db/01_schema.sql`, line 100)
  - `idx_payment_status` on `payment (status, created_at DESC)` (`db/01_schema.sql`, line 101)

### 3. Stored Functions (`db/02_functions.sql`)
- `fn_hours_billed(p_session INT) RETURNS INT` (`db/02_functions.sql`, lines 3–21) — computes `GREATEST(1, CEIL(minutes_parked / 60.0))` using `COALESCE(exit_time, now())`
- `calc_fee(p_session INT) RETURNS NUMERIC` (`db/02_functions.sql`, lines 23–52) — returns `0` for `MONTHLY` pass vehicles, otherwise calculates `first_hour + (hours - 1) * extra_hour` from `tariff`

### 4. Triggers (`db/03_triggers.sql`)
- `trg_sync_slot_status` (`db/03_triggers.sql`, lines 3–34) — `AFTER INSERT OR UPDATE OF exit_time ON parking_session`:
  - On `INSERT`: marks the slot `OCCUPIED` and deletes any matching reservation on that slot for that plate
  - On `UPDATE` of `exit_time` from `NULL` to non-`NULL`: marks the slot `FREE`
- `trg_create_payment` (`db/03_triggers.sql`, lines 36–54) — `AFTER UPDATE OF exit_time ON parking_session`:
  - Automatically inserts a `PENDING` row in `payment` with `amount = calc_fee(NEW.session_id)` when a session closes
- `trg_sync_reservation_slot` (`db/03_triggers.sql`, lines 56–82) — `AFTER INSERT OR DELETE ON reservation`:
  - Synchronizes reserved slot status when reservations are created or removed

### 5. Views (`db/04_views.sql`)
- `v_floor_occupancy` (`db/04_views.sql`, lines 3–21) — per-floor totals, occupied, reserved, free slots, and occupancy percentage
- `v_active_sessions` (`db/04_views.sql`, lines 23–40) — currently parked vehicles with elapsed minutes and live `calc_fee(session_id)`
- `v_slot_detail` (`db/04_views.sql`, lines 42–75) — complete slot inspection view combining slot attributes, floor name, open session details, and active reservation
- `v_vehicle_list` (`db/04_views.sql`, lines 77–90) — registered vehicles with owner name, vehicle type, plan, total visit count, and `last_seen` timestamp
- `v_payment_list` (`db/04_views.sql`, lines 92–102) — formatted receipt numbers (`P-<id>`), plate, method, amount, status, and timestamp
- `v_revenue_by_day` (`db/04_views.sql`, lines 104–112) — daily aggregated count and revenue of `PAID` payments

### 6. Transactions & Concurrency Control (`server/src/routes/`)
- **Entry Slot Allocation (`FOR UPDATE SKIP LOCKED`)**:
  - `POST /api/entry` in `server/src/routes/sessions.js` (lines 18–142) — runs inside an explicit `BEGIN ... COMMIT / ROLLBACK` transaction on a dedicated client from `pool.connect()`, selecting the next free bay with `FOR UPDATE SKIP LOCKED` (lines 86–101) so concurrent gate requests never double-book a slot
- **Exit & Payment Settlement**:
  - `POST /api/sessions/:id/exit` in `server/src/routes/sessions.js` (lines 225–271) — atomically sets `exit_time` (firing `trg_sync_slot_status` and `trg_create_payment`) and marks the resulting payment `PAID`
- **Owner & Vehicle Registration**:
  - `POST /api/vehicles` in `server/src/routes/vehicles.js` (lines 79–140) — reuses an existing owner by phone or creates a new owner and inserts the vehicle inside one transaction
