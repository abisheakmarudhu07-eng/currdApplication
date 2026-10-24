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
  console.log('=== Testing workaround: Create table first, then add FKs ===');

  // Create table without foreign keys
  await connection.query(`
    CREATE TABLE IF NOT EXISTS test_workaround_fk (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      food_id BIGINT UNSIGNED NOT NULL,
      source_record_id BIGINT UNSIGNED NULL,
      basis_amount DECIMAL(10,4) NOT NULL DEFAULT 100.0000,
      is_preferred TINYINT(1) NOT NULL DEFAULT 0,
      review_status ENUM('PENDING','NEEDS_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
      preferred_food_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN is_preferred = 1 AND review_status = 'APPROVED' THEN food_id ELSE NULL END) STORED,
      PRIMARY KEY (id),
      UNIQUE KEY uq_one_preferred_profile_per_food (preferred_food_id),
      KEY idx_nutrition_profile_food (food_id, review_status),
      CONSTRAINT chk_nutrition_basis_positive CHECK (basis_amount > 0)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
  console.log('✓ Table created without FKs');

  // Add foreign keys afterward
  await connection.query(`
    ALTER TABLE test_workaround_fk
    ADD CONSTRAINT fk_test_food FOREIGN KEY (food_id) REFERENCES foods(id)
        ON UPDATE CASCADE ON DELETE CASCADE
  `);
  console.log('✓ Added FK to foods');

  await connection.query(`
    ALTER TABLE test_workaround_fk
    ADD CONSTRAINT fk_test_source FOREIGN KEY (source_record_id) REFERENCES food_source_records(id)
        ON UPDATE CASCADE ON DELETE SET NULL
  `);
  console.log('✓ Added FK to food_source_records');

  console.log('\n✅ WORKAROUND SUCCESSFUL! This is the solution.');

} catch (error: any) {
  console.error('✗ FAILED:', error.message);
  console.error('Code:', error.code);
} finally {
  await connection.end();
}
