import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { db } from './db/pool.js';

export const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: env.API_CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok', service: 'currd-api' });
});

app.get('/api/health/db', async (_request, response) => {
  try {
    await db.query('SELECT 1 AS ok');
    response.status(200).json({ status: 'ok', database: 'reachable' });
  } catch {
    response.status(503).json({ status: 'error', database: 'unreachable' });
  }
});
