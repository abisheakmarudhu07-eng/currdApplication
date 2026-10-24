-- READ-ONLY inspection. Run in MySQL Workbench using an account allowed to inspect mysql.user.
-- These statements do not create, modify, or delete any database, account, or data.

SELECT @@hostname AS server_host, @@port AS server_port, VERSION() AS server_version;

SELECT SCHEMA_NAME AS matching_database
FROM INFORMATION_SCHEMA.SCHEMATA
WHERE SCHEMA_NAME = 'food_fitness_tracker';

SELECT User AS account_name, Host AS allowed_host, plugin AS authentication_plugin, account_locked
FROM mysql.user
WHERE User IN ('food_app', 'food_migrator')
ORDER BY User, Host;

-- After reviewing the rows above, run SHOW GRANTS only for exact accounts returned.
-- Examples (run each only if that account/host exists):
-- SHOW GRANTS FOR 'food_app'@'127.0.0.1';
-- SHOW GRANTS FOR 'food_app'@'localhost';
-- SHOW GRANTS FOR 'food_migrator'@'127.0.0.1';
-- SHOW GRANTS FOR 'food_migrator'@'localhost';
