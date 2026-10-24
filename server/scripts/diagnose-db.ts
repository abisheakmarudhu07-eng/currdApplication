import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: process.env.ENV_FILE ?? path.resolve(process.cwd(), '../.env') });

const connection = await mysql.createConnection({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT),
  database: process.env.MYSQL_DATABASE,
  user: process.env.MYSQL_MIGRATION_USER,
  password: process.env.MYSQL_MIGRATION_PASSWORD,
  charset: 'utf8mb4'
});

try {
  console.log('=== TABLES ===');
  const [tables] = await connection.query('SHOW TABLES');
  console.log(tables);

  console.log('\n=== SCHEMA_MIGRATIONS ===');
  const [migrations] = await connection.query('SELECT * FROM schema_migrations');
  console.log(migrations);

  console.log('\n=== TABLE STRUCTURES ===');
  for (const row of tables as any[]) {
    const tableName = Object.values(row)[0];
    console.log(`\n--- ${tableName} ---`);
    const [structure] = await connection.query(`SHOW CREATE TABLE \`${tableName}\``);
    console.log((structure as any[])[0]['Create Table']);
  }

  console.log('\n=== FOREIGN KEY CONSTRAINTS ===');
  const [fks] = await connection.query(`
    SELECT
      TABLE_NAME,
      CONSTRAINT_NAME,
      COLUMN_NAME,
      REFERENCED_TABLE_NAME,
      REFERENCED_COLUMN_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `, [process.env.MYSQL_DATABASE]);
  console.log(fks);

} finally {
  await connection.end();
}
