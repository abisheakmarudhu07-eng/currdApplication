# Native MySQL setup (Windows)

## Verified facts supplied by the developer

- MySQL Server 8.0.36
- Host `127.0.0.1`, port `3306`
- MySQL Workbench can connect without showing a password prompt
- `mysql` is not currently found in PowerShell/CMD
- Port `3307` is not reachable

A Workbench connection opening without a prompt does not establish that a server account has a blank password. Workbench may have stored credentials, or the configured authentication mechanism may not require a prompt. Do not infer the password from this behavior.

## 1. Inspect first; do not change accounts blindly

Open `database/admin/01_inspect_existing_mysql.sql` in Workbench and execute it using the same administrative connection that was used to verify `SELECT @@port, VERSION()` and `SHOW DATABASES`.

Record:

- whether `food_fitness_tracker` is returned
- which host entries exist for `food_app` and `food_migrator`
- the authentication plugin and locked status
- `SHOW GRANTS` output for every existing matching account

If `mysql.user` cannot be read, do not try to bypass that restriction. Use an administrator connection that is permitted to inspect accounts, or ask the local DB administrator to run the inspection queries.

## 2. Provision missing objects only

Review `database/admin/02_create_missing_local_accounts.sql.example`. Replace its password placeholders before running it. Run only the CREATE USER / GRANT blocks for accounts confirmed missing. If a user exists already, `CREATE USER IF NOT EXISTS` will not update its password; do not assume you know that password. Review its grants first. If the password is unknown, create a separately named local account after approval rather than resetting an existing account.

`CREATE DATABASE IF NOT EXISTS` preserves an existing database. Never use DROP DATABASE for setup.

Permissions are intentionally separated:

- `food_app`: SELECT, INSERT, UPDATE, DELETE; used by the API and food staging import.
- `food_migrator`: SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX, REFERENCES; used only by schema migrations.

If a particular later migration requires a privilege not listed here, review and grant the minimum needed for that migration rather than using root as the application account.

## 3. Configure the root `.env`

Copy `.env.example` to `.env` and set the actual passwords assigned to the matching accounts:

```dotenv
APP_ENV=development
API_PORT=3000
API_CORS_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:3000/api
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_DATABASE=food_fitness_tracker
MYSQL_USER=food_app
MYSQL_PASSWORD=YOUR_ACTUAL_FOOD_APP_PASSWORD
MYSQL_MIGRATION_USER=food_migrator
MYSQL_MIGRATION_PASSWORD=YOUR_ACTUAL_FOOD_MIGRATOR_PASSWORD
```

The `.env.example` file uses nonempty placeholders deliberately. Do not put credentials in source code or `VITE_` variables. Verify `.env` is ignored by Git with `git check-ignore .env`.

## 4. Run migrations without launching Docker MySQL

Install dependencies at the repository root, then run:

```cmd
npm install
npm run cold-start
```

`cold-start` now runs only the versioned database migration runner. It does not start a second MySQL server, create or reset accounts, drop a database, or import/promote unreviewed food records. The target database must already exist and both accounts must be configured as described above.

For API development, run `npm run dev`. The health endpoints are expected to be:

- `http://localhost:3000/api/health`
- `http://localhost:3000/api/health/db`

The database health endpoint is the proof of an application connection; a successful Workbench connection alone is not enough.

## 5. Troubleshooting

- `ECONNREFUSED 127.0.0.1:3306`: check the Windows MySQL service and port.
- `ER_ACCESS_DENIED_ERROR`: verify the exact username/host entry, known password, authentication plugin and grants. Do not reset root to fix an app account issue.
- `ER_BAD_DB_ERROR`: the database does not exist or the name is different; create it only after checking the database list.
- Migration privilege errors: inspect the specific error and grant only the required privilege to `food_migrator`.
- Existing schema migration checksum mismatch: do not edit an applied migration; restore the file or create a new numbered migration after reviewing the state.

## Optional Docker MySQL

The optional service is isolated behind the `docker-mysql` profile and uses host port `MYSQL_DOCKER_PORT` (default 3307). Do not run it when targeting the already-running native server on port 3306. It is not used by `npm run cold-start`.
