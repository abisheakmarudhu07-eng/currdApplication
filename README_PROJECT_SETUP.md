# Currd application starter setup

This is a starter overlay for the existing `currdApplication` Git repository. It does not include `.git` and does not change the user's GitHub settings.

## Baseline

- Node.js 24 LTS (`.node-version` records 24.22.1 as the baseline at scaffold creation).
- React + TypeScript + Vite for the frontend.
- Express + TypeScript for the backend.
- MySQL 8.4 in Docker Compose for consistent local database setup.
- SQL-first versioned migrations. Do not use a second migration framework in parallel.

## First-time setup (Windows CMD)

1. Install Node.js 24 LTS and Docker Desktop, then restart the terminal.
2. In the repository root, copy `.env.example` to `.env`:

   ```cmd
   copy .env.example .env
   notepad .env
   ```

   Change the sample local passwords before starting MySQL. Do not commit `.env`.
3. Install dependencies and generate the lockfile:

   ```cmd
   npm install
   ```
4. Start MySQL, create the schema, and seed only trusted catalogue reference metadata:

   ```cmd
   npm run cold-start
   ```

5. Start the API and frontend:

   ```cmd
   npm run dev
   ```

6. Open `http://localhost:5173`; test API health at `http://localhost:3000/api/health` and database health at `http://localhost:3000/api/health/db`.

## Database behavior

- MySQL's persistent Docker volume is `currd_mysql_data`.
- `npm run cold-start` starts MySQL and applies every unapplied `database/migrations/*.sql` file in name order.
- Each migration filename and SHA-256 are recorded in `schema_migrations`. Applied migration files must be treated as immutable. To change schema, add a new numbered migration.
- The first migration creates the food catalogue/data-ingestion schema and reference metadata only. It deliberately does not yet contain users, profiles, goals, meal logs, or admin tables because those application requirements are still being finalized.
- Cold start does **not** download or approve third-party food data. Imported records first go into staging; source licensing, duplicates and QA must be reviewed before live catalogue promotion.
- `npm run food:build` downloads/builds the community source candidate files under ignored `build/food-import/`.
- `npm run food:stage` loads the generated SQL into `food_import_staging`. It is an explicit command and does not approve records. Run it only after choosing to stage that source and reviewing its license/provenance notes.

## Environment variables

Only `.env.example` belongs in Git. `.env` is local-only. Frontend configuration uses `VITE_API_BASE_URL`; only `VITE_` variables are exposed to browser code. Never put passwords, API secrets, or database credentials in any `VITE_` variable.

`MYSQL_PORT` is the host port mapped to container port 3306; the default is 3307 to avoid colliding with another local MySQL server. The Node app runs on the host and connects to `127.0.0.1:3307`.

## Git hygiene

Review `git status` before each commit. Commit `package-lock.json` after `npm install` so both machines use the same dependency tree. Do not commit `.env`, downloaded raw datasets, generated staging SQL, or credentials.
