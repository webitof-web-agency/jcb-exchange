// Bank reconciliation rules (pure).

const DAY_MS = 24 * 60 * 60 * 1000;

/** Signed amounts: positive = money into the bank. */
export type StatementRow = { id: string; date: Date; amount: number; text: string };
export type BookLine = { id: string; date: Date; amount: number; refs: string[] };

const normalise = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Proposes one-to-one matches: same amount and direction within `windowDays`. When several book
 * lines qualify, a voucher number / reference found in the statement text wins, then the closest
 * date; anything still ambiguous is left for a person.
 */
export const proposeMatches = (statement: StatementRow[], book: BookLine[], windowDays = 3) => {
  const used = new Set<string>();
  const matches: Array<{ statementId: string; bookId: string; reason: 'UNIQUE' | 'REFERENCE' | 'NEAREST' }> = [];
  const rows = [...statement].sort((a, b) => a.date.getTime() - b.date.getTime() || a.id.localeCompare(b.id));
  for (const row of rows) {
    const candidates = book.filter((line) => !used.has(line.id) && Math.abs(line.amount - row.amount) < 0.005 && Math.abs(line.date.getTime() - row.date.getTime()) <= windowDays * DAY_MS);
    if (!candidates.length) continue;
    let chosen: BookLine | undefined;
    let reason: 'UNIQUE' | 'REFERENCE' | 'NEAREST' = 'UNIQUE';
    if (candidates.length === 1) chosen = candidates[0];
    else {
      const text = normalise(row.text);
      const byRef = candidates.filter((line) => line.refs.some((ref) => normalise(ref).length >= 4 && text.includes(normalise(ref))));
      if (byRef.length === 1) {
        chosen = byRef[0];
        reason = 'REFERENCE';
      } else {
        const pool = byRef.length ? byRef : candidates;
        const gap = (line: BookLine) => Math.abs(line.date.getTime() - row.date.getTime());
        const best = Math.min(...pool.map(gap));
        const nearest = pool.filter((line) => gap(line) === best);
        if (nearest.length === 1) {
          chosen = nearest[0];
          reason = 'NEAREST';
        }
      }
    }
    if (!chosen) continue;
    used.add(chosen.id);
    matches.push({ statementId: row.id, bookId: chosen.id, reason });
  }
  return matches;
};

/**
 * Bank reconciliation statement. Book balance adjusted for items only on one side should equal
 * the bank's own balance; any remainder is an unexplained difference.
 */
export const reconcile = (input: {
  bookBalance: number;
  statementBalance: number | null;
  bookOnly: Array<{ amount: number }>;
  statementOnly: Array<{ amount: number }>;
}) => {
  const round = (value: number) => Math.round(value * 100) / 100;
  const depositsNotCredited = round(input.bookOnly.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0));
  const paymentsNotPresented = round(-input.bookOnly.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0));
  const bankCreditsNotInBooks = round(input.statementOnly.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0));
  const bankDebitsNotInBooks = round(-input.statementOnly.filter((item) => item.amount < 0).reduce((sum, item) => sum + item.amount, 0));
  const expectedStatement = round(input.bookBalance - depositsNotCredited + paymentsNotPresented + bankCreditsNotInBooks - bankDebitsNotInBooks);
  return {
    bookBalance: round(input.bookBalance),
    depositsNotCredited,
    paymentsNotPresented,
    bankCreditsNotInBooks,
    bankDebitsNotInBooks,
    expectedStatement,
    statementBalance: input.statementBalance,
    difference: input.statementBalance === null ? null : round(input.statementBalance - expectedStatement),
  };
};
