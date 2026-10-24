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
  console.log('=== Testing with generated column and UNIQUE constraint ===');
  try {
    await connection.query(`
      CREATE TABLE test_with_generated (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        food_id BIGINT UNSIGNED NOT NULL,
        is_preferred TINYINT(1) NOT NULL DEFAULT 0,
        review_status ENUM('PENDING','NEEDS_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        preferred_food_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN is_preferred = 1 AND review_status = 'APPROVED' THEN food_id ELSE NULL END) STORED,
        PRIMARY KEY (id),
        UNIQUE KEY uq_test (preferred_food_id),
        CONSTRAINT fk_test_food FOREIGN KEY (food_id) REFERENCES foods(id)
      ) ENGINE=InnoDB
    `);
    console.log('✓ Table with generated column created successfully');
  } catch (error: any) {
    console.error('✗ Failed:', error.message);
    console.error('Error code:', error.code);
  }

  console.log('\n=== Testing the full food_nutrition_profiles statement ===');
  try {
    await connection.query(`
      CREATE TABLE test_full_nutrition_profiles (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        food_id BIGINT UNSIGNED NOT NULL,
        source_record_id BIGINT UNSIGNED NULL,
        basis_amount DECIMAL(10,4) NOT NULL DEFAULT 100.0000,
        basis_unit ENUM('g','ml') NOT NULL DEFAULT 'g',
        profile_method ENUM('SOURCE_REPORTED','RECIPE_CALCULATED','USER_LABEL','USER_ENTERED') NOT NULL DEFAULT 'SOURCE_REPORTED',
        review_status ENUM('PENDING','NEEDS_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        is_preferred TINYINT(1) NOT NULL DEFAULT 0,
        preferred_food_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN is_preferred = 1 AND review_status = 'APPROVED' THEN food_id ELSE NULL END) STORED,
        notes TEXT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_one_preferred_profile_per_food (preferred_food_id),
        KEY idx_nutrition_profile_food (food_id, review_status),
        CONSTRAINT fk_nutrition_profile_food FOREIGN KEY (food_id) REFERENCES foods(id)
            ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT fk_nutrition_profile_source_record FOREIGN KEY (source_record_id) REFERENCES food_source_records(id)
            ON UPDATE CASCADE ON DELETE SET NULL,
        CONSTRAINT chk_nutrition_basis_positive CHECK (basis_amount > 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
    `);
    console.log('✓ Full table created successfully!');
  } catch (error: any) {
    console.error('✗ Failed:', error.message);
    console.error('Error code:', error.code);

    console.log('\n=== Testing without the CHECK constraint ===');
    try {
      await connection.query(`
        CREATE TABLE test_no_check (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          food_id BIGINT UNSIGNED NOT NULL,
          source_record_id BIGINT UNSIGNED NULL,
          basis_amount DECIMAL(10,4) NOT NULL DEFAULT 100.0000,
          basis_unit ENUM('g','ml') NOT NULL DEFAULT 'g',
          profile_method ENUM('SOURCE_REPORTED','RECIPE_CALCULATED','USER_LABEL','USER_ENTERED') NOT NULL DEFAULT 'SOURCE_REPORTED',
          review_status ENUM('PENDING','NEEDS_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
          is_preferred TINYINT(1) NOT NULL DEFAULT 0,
          preferred_food_id BIGINT UNSIGNED GENERATED ALWAYS AS (CASE WHEN is_preferred = 1 AND review_status = 'APPROVED' THEN food_id ELSE NULL END) STORED,
          notes TEXT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_one_preferred_profile_per_food (preferred_food_id),
          KEY idx_nutrition_profile_food (food_id, review_status),
          CONSTRAINT fk_nutrition_profile_food FOREIGN KEY (food_id) REFERENCES foods(id)
              ON UPDATE CASCADE ON DELETE CASCADE,
          CONSTRAINT fk_nutrition_profile_source_record FOREIGN KEY (source_record_id) REFERENCES food_source_records(id)
              ON UPDATE CASCADE ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
      `);
      console.log('✓ Table without CHECK constraint created successfully!');
    } catch (error2: any) {
      console.error('✗ Still failed:', error2.message);
    }
  }

} finally {
  await connection.end();
}
