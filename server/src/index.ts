import { app } from './app.js';
import { env } from './config/env.js';
import { db } from './db/pool.js';

const server = app.listen(env.API_PORT, () => {
  console.info(`Currd API listening on http://localhost:${env.API_PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.info(`${signal} received; shutting down gracefully.`);
  server.close(async () => {
    await db.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
