# Database layer status

`schema.sql` is a proposed normalized PostgreSQL schema for the next implementation stage. `migrations/001_initial.sql` is the first draft of the corresponding initial migration. They are **not wired into the baseline server**, which currently reads and writes a local JSON file in `data/` (or `CIVICCHAIN_DATA_DIR`). The optional `postgres-scaffold` Compose profile starts a PostgreSQL service for development planning only; it does not make the app use PostgreSQL.

Do not mark database migration as complete until an actual database adapter, migration runner, transactional repository implementation, concurrency strategy, and PostgreSQL-backed integration tests exist. Replace the scaffold password before starting the optional service in a shared environment.
