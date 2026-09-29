/** "1 account", "2 accounts". Pass `plural` for irregular nouns. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`
}
