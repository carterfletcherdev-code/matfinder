export function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Title-case a string: capitalize the first letter of every word.
 * Preserves all-caps acronyms (≥2 chars, all letters) like "BJJ", "MMA".
 * Used wherever user-supplied display strings (class names, etc.) might
 * arrive in mixed or lower case.
 */
export function titleCase(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\b([a-zA-Z][a-zA-Z'-]*)\b/g, (word) => {
    if (word.length >= 2 && word === word.toUpperCase()) return word; // BJJ, MMA, …
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}
