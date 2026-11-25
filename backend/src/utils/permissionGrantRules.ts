/** The permissions in `wanted` that `held` does not cover (none when ALL_ACCESS is held). No database: unit-tested. */
export const permissionsNotHeld = (held: ReadonlySet<string>, wanted: Iterable<string>): string[] => {
  if (held.has('ALL_ACCESS')) return [];
  return [...new Set(wanted)].filter((permission) => !held.has(permission));
};
