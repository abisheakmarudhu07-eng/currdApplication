import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE ?? path.resolve(process.cwd(), '../.env') });

const sqlPath = path.resolve(process.cwd(), '../build/food-import/food_staging_import.sql');
for (const key of ['MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE', 'MYSQL_USER', 'MYSQL_PASSWORD']) {
  if (!process.env[key]) throw new Error(`Missing ${key}; check the root .env file.`);
}

try {
  const sql = await fs.readFile(sqlPath, 'utf8');
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT),
    database: process.env.MYSQL_DATABASE,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    multipleStatements: true,
    charset: 'utf8mb4'
  });

  try {
    await connection.query(sql);
    console.info('Food source records were loaded into food_import_staging only. They remain pending review.');
  } finally {
    await connection.end();
  }
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
    throw new Error('Staging SQL not found. First run npm run food:build and review build/food-import/food_qa_report.csv.');
  }
  throw error;
}
