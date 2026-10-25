// Proper SQL statement splitter that handles comments correctly
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = i + 1 < sql.length ? sql[i + 1] : '';

    // Handle escape sequences in strings
    if (inString && escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (inString && char === '\\') {
      current += char;
      escaped = true;
      continue;
    }

    // Handle string literals
    if ((char === "'" || char === '"' || char === '`') && !inLineComment && !inBlockComment) {
      if (!inString) {
        inString = true;
        stringChar = char;
        current += char;
      } else if (char === stringChar) {
        inString = false;
        current += char;
      } else {
        current += char;
      }
      continue;
    }

    // If we're in a string, just accumulate
    if (inString) {
      current += char;
      continue;
    }

    // Handle line comments (-- or #)
    if (!inBlockComment && ((char === '-' && nextChar === '-') || char === '#')) {
      inLineComment = true;
      // Skip the comment, don't add to current
      if (char === '-') i++; // Skip second dash
      continue;
    }

    if (inLineComment && (char === '\n' || char === '\r')) {
      inLineComment = false;
      // Add newline to preserve statement structure for multiline statements
      current += '\n';
      continue;
    }

    if (inLineComment) {
      // Skip comment content
      continue;
    }

    // Handle block comments /* */
    if (!inBlockComment && char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++; // Skip the *
      continue;
    }

    if (inBlockComment && char === '*' && nextChar === '/') {
      inBlockComment = false;
      i++; // Skip the /
      continue;
    }

    if (inBlockComment) {
      // Skip block comment content
      continue;
    }

    // Handle statement terminator
    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    // Accumulate non-comment, non-string content
    current += char;
  }

  // Handle final statement without semicolon
  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements;
}
