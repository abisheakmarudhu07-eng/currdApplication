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
  // Clean up any test tables first
  const testTables = [
    'test_nutrition_profiles', 'test_nutrition_profiles2', 'test_nutrition_profiles3',
    'test_with_generated', 'test_full_nutrition_profiles', 'test_no_check',
    'test_step1', 'test_step2', 'test_step3'
  ];

  for (const table of testTables) {
    try {
      await connection.query(`DROP TABLE IF EXISTS ${table}`);
    } catch (e) {
      // Ignore errors
    }
  }

  console.log('=== Step 1: Basic table with FKs (no generated column) ===');
  try {
    await connection.query(`
      CREATE TABLE test_step1 (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        food_id BIGINT UNSIGNED NOT NULL,
        source_record_id BIGINT UNSIGNED NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_test1_food FOREIGN KEY (food_id) REFERENCES foods(id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_test1_source FOREIGN KEY (source_record_id) REFERENCES food_source_records(id) ON UPDATE CASCADE ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    console.log('✓ SUCCESS');
    await connection.query('DROP TABLE test_step1');
  } catch (error: any) {
    console.error('✗ FAILED:', error.message);
  }

  console.log('\n=== Step 2: Add generated column (no unique constraint on it) ===');
  try {
    await connection.query(`
      CREATE TABLE test_step2 (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        food_id BIGINT UNSIGNED NOT NULL,
        source_record_id BIGINT UNSIGNED NULL,
        is_preferred TINYINT(1) NOT NULL DEFAULT 0,
        review_status ENUM('PENDING','APPROVED') NOT NULL DEFAULT 'PENDING',
        preferred_food_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN is_preferred = 1 AND review_status = 'APPROVED' THEN food_id ELSE NULL END) STORED,
        PRIMARY KEY (id),
        CONSTRAINT fk_test2_food FOREIGN KEY (food_id) REFERENCES foods(id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_test2_source FOREIGN KEY (source_record_id) REFERENCES food_source_records(id) ON UPDATE CASCADE ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    console.log('✓ SUCCESS');
    await connection.query('DROP TABLE test_step2');
  } catch (error: any) {
    console.error('✗ FAILED:', error.message);
  }

  console.log('\n=== Step 3: Add UNIQUE constraint on generated column ===');
  try {
    await connection.query(`
      CREATE TABLE test_step3 (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        food_id BIGINT UNSIGNED NOT NULL,
        source_record_id BIGINT UNSIGNED NULL,
        is_preferred TINYINT(1) NOT NULL DEFAULT 0,
        review_status ENUM('PENDING','APPROVED') NOT NULL DEFAULT 'PENDING',
        preferred_food_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN is_preferred = 1 AND review_status = 'APPROVED' THEN food_id ELSE NULL END) STORED,
        PRIMARY KEY (id),
        UNIQUE KEY uq_preferred (preferred_food_id),
        CONSTRAINT fk_test3_food FOREIGN KEY (food_id) REFERENCES foods(id) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_test3_source FOREIGN KEY (source_record_id) REFERENCES food_source_records(id) ON UPDATE CASCADE ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    console.log('✓ SUCCESS');
    await connection.query('DROP TABLE test_step3');
  } catch (error: any) {
    console.error('✗ FAILED:', error.message);
    console.error('This is the problem! The generated column with UNIQUE constraint breaks FK creation.');
  }

  console.log('\n=== Checking MySQL version (might be version-specific bug) ===');
  const [version] = await connection.query('SELECT VERSION() as version');
  console.log(version);

} finally {
  await connection.end();
}
