# Initial technical decisions

- Frontend: React + TypeScript + Vite.
- Backend: Express + TypeScript.
- Database: MySQL 8.4 LTS series for local development, via Docker Compose.
- Repository layout: npm workspaces in one repository (monorepo).
- Configuration: root `.env` locally, `.env.example` committed. Browser-visible settings must have the `VITE_` prefix; secrets never do.
- Database changes: versioned SQL files under `database/migrations`. Applied migration files are immutable; changes require a new migration.
- Data loading: source downloads and CSV/SQL build artifacts are generated locally and ignored by Git. Source food rows load to staging and stay pending review until QA and licensing decisions are done.
- No application user/auth/meal-log tables in the first food-catalogue migration. Those will be designed separately after food-data requirements are confirmed.
