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

/** The first risky statement in a migration file, or null if it only adds things. */
export function riskyStatement(sql) {
  const withoutComments = sql.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
  for (const statement of withoutComments.split(/;|-->\s*statement-breakpoint/)) {
    if (RISKY.some((pattern) => pattern.test(statement))) return statement.trim().slice(0, 120)
  }
  return null
}
