# PostgreSQL migration notes

- SQLite remains legacy fallback.
- Use DB_BACKEND=postgres and DATABASE_URL to switch.
- Run `python backend/migrate_sqlite_to_postgres.py` after setting DATABASE_URL.
