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
  console.log('=== Checking foods.id column ===');
  const [foodsCols] = await connection.query(`
    SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'foods' AND COLUMN_NAME = 'id'
  `, [process.env.MYSQL_DATABASE]);
  console.log(foodsCols);

  console.log('\n=== Checking food_source_records.id column ===');
  const [sourceCols] = await connection.query(`
    SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'food_source_records' AND COLUMN_NAME = 'id'
  `, [process.env.MYSQL_DATABASE]);
  console.log(sourceCols);

  console.log('\n=== Testing FK constraint creation manually ===');
  try {
    await connection.query(`
      CREATE TABLE test_nutrition_profiles (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        food_id BIGINT UNSIGNED NOT NULL,
        source_record_id BIGINT UNSIGNED NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_test_food FOREIGN KEY (food_id) REFERENCES foods(id),
        CONSTRAINT fk_test_source FOREIGN KEY (source_record_id) REFERENCES food_source_records(id)
      ) ENGINE=InnoDB
    `);
    console.log('✓ Test table with both FKs created successfully');
    await connection.query('DROP TABLE test_nutrition_profiles');
  } catch (error: any) {
    console.error('✗ Test table creation failed:', error.message);
    console.error('Error code:', error.code);
  }

  console.log('\n=== Testing FK constraint to foods only ===');
  try {
    await connection.query(`
      CREATE TABLE test_nutrition_profiles2 (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        food_id BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_test_food2 FOREIGN KEY (food_id) REFERENCES foods(id)
      ) ENGINE=InnoDB
    `);
    console.log('✓ Test table with foods FK created successfully');
    await connection.query('DROP TABLE test_nutrition_profiles2');
  } catch (error: any) {
    console.error('✗ Test table creation failed:', error.message);
  }

  console.log('\n=== Testing FK constraint to food_source_records only ===');
  try {
    await connection.query(`
      CREATE TABLE test_nutrition_profiles3 (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        source_record_id BIGINT UNSIGNED NULL,
        PRIMARY KEY (id),
        CONSTRAINT fk_test_source3 FOREIGN KEY (source_record_id) REFERENCES food_source_records(id)
      ) ENGINE=InnoDB
    `);
    console.log('✓ Test table with food_source_records FK created successfully');
    await connection.query('DROP TABLE test_nutrition_profiles3');
  } catch (error: any) {
    console.error('✗ Test table creation failed:', error.message);
  }

  console.log('\n=== Checking index on foods(id) ===');
  const [foodsIndexes] = await connection.query(`SHOW INDEXES FROM foods WHERE Column_name = 'id'`);
  console.log(foodsIndexes);

  console.log('\n=== Checking index on food_source_records(id) ===');
  const [sourceIndexes] = await connection.query(`SHOW INDEXES FROM food_source_records WHERE Column_name = 'id'`);
  console.log(sourceIndexes);

} finally {
  await connection.end();
}
