import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE ?? path.resolve(process.cwd(), '../.env') });

const requiredEnv = [
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_DATABASE',
  'MYSQL_MIGRATION_USER',
  'MYSQL_MIGRATION_PASSWORD'
] as const;

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing ${key}. Check the root .env file and the MySQL migration account setup.`);
  }
}

const migrationDirectory = path.resolve(process.cwd(), '../database/migrations');
const retryAttempts = 5;
const retryDelayMs = 2000;
let connection: Connection | undefined;

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function isTransientConnectionError(error: unknown): boolean {
  return new Set([
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'PROTOCOL_CONNECTION_LOST',
    'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR'
  ]).has(getErrorCode(error) ?? '');
}

async function connectToMySql(): Promise<Connection> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    try {
      return await mysql.createConnection({
        host: process.env.MYSQL_HOST,
        port: Number(process.env.MYSQL_PORT),
        database: process.env.MYSQL_DATABASE,
        user: process.env.MYSQL_MIGRATION_USER,
        password: process.env.MYSQL_MIGRATION_PASSWORD,
        multipleStatements: false, // Changed to false for better error reporting
        charset: 'utf8mb4'
      });
    } catch (error) {
      lastError = error;
      if (!isTransientConnectionError(error) || attempt === retryAttempts) break;
      console.info(`MySQL is not reachable yet (${attempt}/${retryAttempts}); retrying in ${retryDelayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  const code = getErrorCode(lastError);
  const hint = code === 'ER_ACCESS_DENIED_ERROR'
    ? ' Verify MYSQL_MIGRATION_USER, its password, host entry, and grants.'
    : code === 'ER_BAD_DB_ERROR'
      ? ' The configured database does not exist. Inspect it first, then create it without dropping existing data.'
      : ' Verify the MySQL service, host, and port.';
  throw new Error(`Could not connect to the configured MySQL database.${hint} Last error: ${String(lastError)}`);
}

// Split SQL into individual statements
function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let escaped = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      current += char;
      continue;
    }

    if ((char === "'" || char === '"') && !inString) {
      inString = true;
      stringChar = char;
      current += char;
      continue;
    }

    if (char === stringChar && inString) {
      inString = false;
      current += char;
      continue;
    }

    if (char === ';' && !inString) {
      const trimmed = current.trim();
      if (trimmed && !trimmed.startsWith('--')) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed && !trimmed.startsWith('--')) {
    statements.push(trimmed);
  }

  return statements;
}

connection = await connectToMySql();

try {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (version)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);

  const files = (await fs.readdir(migrationDirectory))
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right, 'en'));

  if (files.length === 0) {
    throw new Error(`No .sql migrations found in ${migrationDirectory}`);
  }

  for (const file of files) {
    const fullPath = path.join(migrationDirectory, file);
    const sql = await fs.readFile(fullPath, 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const [rows] = await connection.execute<RowDataPacket[]>(
      'SELECT checksum FROM schema_migrations WHERE version = ?',
      [file]
    );

    if (rows.length > 0) {
      if (rows[0].checksum !== checksum) {
        throw new Error(`Applied migration ${file} has changed. Restore it and create a new numbered migration instead.`);
      }
      console.info(`SKIP ${file} (already applied)`);
      continue;
    }

    console.info(`APPLY ${file}`);

    // Split and execute statements individually for better error reporting
    const statements = splitSqlStatements(sql);
    console.info(`  Found ${statements.length} statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      try {
        // Extract table name for logging
        const tableMatch = statement.match(/CREATE TABLE (?:IF NOT EXISTS )?`?(\w+)`?/i);
        const tableName = tableMatch ? tableMatch[1] : 'unknown';

        if (tableMatch) {
          console.info(`  [${i + 1}/${statements.length}] Creating table: ${tableName}`);
        } else {
          const insertMatch = statement.match(/INSERT INTO `?(\w+)`?/i);
          if (insertMatch) {
            console.info(`  [${i + 1}/${statements.length}] Inserting data into: ${insertMatch[1]}`);
          } else {
            console.info(`  [${i + 1}/${statements.length}] Executing statement...`);
          }
        }

        await connection.query(statement);
      } catch (error: any) {
        console.error(`\n❌ ERROR in ${file}, statement ${i + 1}/${statements.length}:`);
        console.error(`Code: ${error.code}`);
        console.error(`Message: ${error.message}`);
        console.error(`SQL State: ${error.sqlState}`);
        console.error(`\nFailing statement (first 500 chars):`);
        console.error(statement.substring(0, 500));
        throw error;
      }
    }

    await connection.execute('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)', [file, checksum]);
    console.info(`DONE ${file}`);
  }

  console.info('Database setup completed. No food rows were promoted from staging.');
} finally {
  await connection.end();
}
