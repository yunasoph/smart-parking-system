-- run_all.sql: Run all ParkSmart database scripts in order (from repository root: psql -f db/run_all.sql)
\set ON_ERROR_STOP on

\i db/01_schema.sql
\i db/02_functions.sql
\i db/03_triggers.sql
\i db/04_views.sql
\i db/07_auth.sql
\i db/05_seed.sql
\i db/06_verify.sql
