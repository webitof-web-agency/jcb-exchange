import prisma from '../../lib/prisma';

/** Collapses runs of spaces and trims, so "  state   manager " and "state manager" are the same designation. */
export const collapseSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * Every spelling of a designation that differs only in case or spacing, oldest first. It is matched in SQL with
 * lower() on purpose: Prisma's case-insensitive equals is an ILIKE, where "_" and "%" in the text act as wildcards.
 */
export const findDesignationSpellings = async (value: string): Promise<string[]> => {
  const key = collapseSpaces(value).toLowerCase();
  if (!key) return [];
  const rows = await prisma.$queryRaw<Array<{ designation: string }>>`
    SELECT "designation", MIN("createdAt") AS "firstSeen"
    FROM "HrmEmploymentAssignment"
    WHERE lower(regexp_replace(trim("designation"), '\\s+', ' ', 'g')) = ${key}
    GROUP BY "designation"
    ORDER BY "firstSeen" ASC
  `;
  return rows.map((row) => row.designation);
};
