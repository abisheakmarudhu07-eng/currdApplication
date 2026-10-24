# Environment configuration

All machine-specific settings are read from the root `.env` file locally or injected as environment variables by the hosting environment in deployment.

| Variable | Used by | Purpose |
|---|---|---|
| `APP_ENV` | API | Runtime environment label |
| `API_PORT` | API | Express listening port |
| `API_CORS_ORIGIN` | API | Allowed browser origin for local development |
| `VITE_API_BASE_URL` | Frontend | Public API base URL; safe to expose in browser code |
| `MYSQL_HOST` / `MYSQL_PORT` | API and Compose | MySQL host and host-mapped port |
| `MYSQL_DATABASE` | API and Compose | App database name |
| `MYSQL_USER` / `MYSQL_PASSWORD` | API and Compose | Local application database account |
| `MYSQL_ROOT_PASSWORD` | Compose only | Local MySQL root password; never needed by the API |

Never commit `.env`. Never use a `VITE_` prefix for a secret; Vite intentionally exposes `VITE_` values to frontend code.
