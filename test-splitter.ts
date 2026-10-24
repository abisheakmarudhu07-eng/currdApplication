import fs from 'node:fs/promises';
import path from 'node:path';

const migrationDirectory = path.resolve(process.cwd(), 'database/migrations');
const fullPath = path.join(migrationDirectory, '0001_food_catalogue.sql');
const sql = await fs.readFile(fullPath, 'utf8');

// Same splitting logic as db-setup.ts
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

const statements = splitSqlStatements(sql);

console.log(`Total statements: ${statements.length}\n`);

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  const firstLine = stmt.split('\n')[0].substring(0, 100);
  console.log(`[${i + 1}] ${firstLine}`);
}
