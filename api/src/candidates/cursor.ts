/**
 * Opaque keyset-pagination cursor.
 *
 * Instead of OFFSET (which makes Postgres read and throw away every earlier row, so page 500
 * is slow), the cursor remembers the sort key of the last row returned: (sortScore, id).
 * The next page is "rows strictly after that key", which the board index can seek to directly.
 */
export interface Cursor {
  sortScore: number; // COALESCE(score, -1)
  id: number;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.sortScore}:${c.id}`, 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  let decoded: string;
  try {
    decoded = Buffer.from(raw, 'base64url').toString('utf8');
  } catch {
    return null;
  }
  const m = /^(-1|\d{1,3}):(\d{1,18})$/.exec(decoded);
  if (!m) return null;
  const sortScore = Number(m[1]);
  const id = Number(m[2]);
  if (sortScore > 100 || !Number.isSafeInteger(id) || id <= 0) return null;
  return { sortScore, id };
}
