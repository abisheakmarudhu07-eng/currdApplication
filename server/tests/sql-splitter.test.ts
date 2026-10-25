import { describe, it } from 'node:test';
import assert from 'node:assert';
import { splitSqlStatements } from '../src/utils/sql-splitter.js';

describe('splitSqlStatements', () => {
  it('should handle leading line comments before statements', () => {
    const sql = `-- This is a comment\nCREATE TABLE test (id INT);`;
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.strictEqual(statements[0], 'CREATE TABLE test (id INT)');
  });

  it('should handle # style comments', () => {
    const sql = `# This is a comment\nCREATE TABLE test (id INT);`;
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.strictEqual(statements[0], 'CREATE TABLE test (id INT)');
  });

  it('should handle inline comments', () => {
    const sql = `CREATE TABLE test ( -- inline comment\n  id INT\n);`;
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0]?.includes('CREATE TABLE test'));
    assert.ok(statements[0]?.includes('id INT'));
    assert.ok(!statements[0]?.includes('inline comment'));
  });

  it('should handle block comments', () => {
    const sql = `/* Multi-line\n   comment */\nCREATE TABLE test (id INT);`;
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.strictEqual(statements[0], 'CREATE TABLE test (id INT)');
  });

  it('should handle comments between statements', () => {
    const sql = `CREATE TABLE test1 (id INT);\n-- Comment between\nCREATE TABLE test2 (id INT);`;
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 2);
    assert.strictEqual(statements[0], 'CREATE TABLE test1 (id INT)');
    assert.strictEqual(statements[1], 'CREATE TABLE test2 (id INT)');
  });

  it('should preserve semicolons in strings', () => {
    const sql = `INSERT INTO test VALUES ('a;b');`;
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0]?.includes("'a;b'"));
  });

  it('should preserve double-dash in strings', () => {
    const sql = `INSERT INTO test VALUES ('a--b');`;
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0]?.includes("'a--b'"));
  });

  it('should handle escaped quotes', () => {
    const sql = `INSERT INTO test VALUES ('don\\'t');`;
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0]?.includes("don\\'t"));
  });

  it('should handle URLs in strings', () => {
    const sql = `INSERT INTO test VALUES ('https://example.com');`;
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0]?.includes('https://example.com'));
  });

  it('should handle the real INSERT INTO food_sources case', () => {
    const sql = `-- Initial source registry. The repository claims CC0, but IFCT/Gopalan upstream rights should be reviewed separately.
INSERT INTO food_sources (source_code, source_name, source_url, license_name, license_review_status, attribution_text, notes)
VALUES
('INDIAN_NUTRITION_GITHUB', 'Indian Food Nutrition Database (community repository)', 'https://github.com/prabhubng/indian-nutrition-data', 'CC0 1.0 claimed by repository', 'UPSTREAM_DECLARED', 'Source: Indian Food Nutrition Database; original source label retained per row.', 'Repository states CC0 and describes 620 records as sourced from IFCT 2017 and Gopalan 2004. Treat as staging input until provenance/licensing and nutrition quality are reviewed.'),
('USDA_FOODDATA_CENTRAL', 'USDA FoodData Central', 'https://fdc.nal.usda.gov/', 'CC0 1.0 Universal / public domain', 'CONFIRMED', 'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.', 'Preferred supplemental source for compatible generic foods and preparation-specific records. Use exact FDC record IDs and preparation descriptions.'),
('INDIAN_NUTRIENT_DATABANK', 'Indian Nutrient Databank (INDB)', 'https://www.anuvaad.org.in/indian-nutrient-databank/', 'Open-access; redistribution terms to confirm', 'PERMISSION_REQUIRED', 'Indian Nutrient Databank (INDB), Anuvaad Solutions.', 'Candidate source for prepared Indian recipes. Confirm permission to bundle source data into the application before moving records to APPROVED.')
ON DUPLICATE KEY UPDATE
    source_name = VALUES(source_name),
    source_url = VALUES(source_url),
    license_name = VALUES(license_name),
    license_review_status = VALUES(license_review_status),
    attribution_text = VALUES(attribution_text),
    notes = VALUES(notes);`;

    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0]?.startsWith('INSERT INTO food_sources'));
    assert.ok(statements[0]?.includes('INDIAN_NUTRITION_GITHUB'));
    assert.ok(statements[0]?.includes('ON DUPLICATE KEY UPDATE'));
    assert.ok(!statements[0]?.includes('Initial source registry'));
  });

  it('should handle multiple statements with mixed comments', () => {
    const sql = `
-- Comment 1
CREATE TABLE test1 (id INT);
/* Block comment */
-- Comment 2
INSERT INTO test1 VALUES (1);
# Comment 3
SELECT * FROM test1;`;

    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 3);
    assert.ok(statements[0]?.includes('CREATE TABLE test1'));
    assert.ok(statements[1]?.includes('INSERT INTO test1'));
    assert.ok(statements[2]?.includes('SELECT * FROM test1'));
  });

  it('should handle backtick identifiers', () => {
    const sql = 'CREATE TABLE `test-table` (`id-col` INT);';
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0]?.includes('`test-table`'));
    assert.ok(statements[0]?.includes('`id-col`'));
  });

  it('should handle double-quoted identifiers', () => {
    const sql = 'CREATE TABLE "test" ("id" INT);';
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0]?.includes('"test"'));
    assert.ok(statements[0]?.includes('"id"'));
  });

  it('should handle comment markers inside strings', () => {
    const sql = `INSERT INTO test VALUES ('/* not a comment */'), ('-- also not a comment'), ('# neither is this');`;
    const statements = splitSqlStatements(sql);
    assert.strictEqual(statements.length, 1);
    assert.ok(statements[0]?.includes('/* not a comment */'));
    assert.ok(statements[0]?.includes('-- also not a comment'));
    assert.ok(statements[0]?.includes('# neither is this'));
  });
});
