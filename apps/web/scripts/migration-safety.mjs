// A migration that can lose data must be run by a person, not by a deploy.
// Matches statements that drop, truncate, delete or rewrite existing data or shape.
const RISKY = [
  /\bdrop\s+(table|column|schema|index|constraint|type|view)\b/i,
  /\btruncate\b/i,
  /\bdelete\s+from\b/i,
  /\balter\s+table\b[^;]*\b(rename|drop)\b/i,
  /\balter\s+column\b[^;]*\b(type|set\s+not\s+null)\b/i,
  /\bupdate\s+"?[\w.]+"?\s+set\b/i,
]

/** `ALTER COLUMN x DROP NOT NULL` and `ALTER COLUMN x DROP DEFAULT` only loosen a column. */
const SAFE_RELAX = /\balter\s+column\s+"?[\w]+"?\s+drop\s+(?:not\s+null|default)\b/gi

/** The first risky statement in a migration file, or null if it only adds things. */
export function riskyStatement(sql) {
  const withoutComments = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
  for (const statement of withoutComments.split(/;|-->\s*statement-breakpoint/)) {
    // Relaxing a constraint never loses data: drop those clauses before checking, so anything else in the statement still counts.
    const checked = statement.replace(SAFE_RELAX, "")
    if (RISKY.some((pattern) => pattern.test(checked))) return statement.trim().slice(0, 120)
  }
  return null
}
