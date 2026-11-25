/** Pure shift timing rules (no database), used by the shift service and its tests. */

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** Length of a shift in minutes, past midnight for a night shift. */
export const shiftLengthMinutes = (startTime: string, endTime: string, isNightShift: boolean) => {
  const start = minutesOf(startTime);
  const end = minutesOf(endTime);
  return end > start && !isNightShift ? end - start : end + 1440 - start;
};

/** Checks that the timings make sense together. Returns a message or null. */
export const describeShiftProblem = (shift: { startTime: string; endTime: string; isNightShift?: boolean | undefined; breakMinutes?: number | undefined; halfDayMinutes?: number | null | undefined; fullDayMinutes?: number | null | undefined }) => {
  const isNight = Boolean(shift.isNightShift);
  if (shift.startTime === shift.endTime) return 'The start and end time cannot be the same.';
  if (!isNight && minutesOf(shift.endTime) < minutesOf(shift.startTime)) return 'The shift ends before it starts. Tick "Night shift" if it ends the next day.';
  if (isNight && minutesOf(shift.endTime) > minutesOf(shift.startTime)) return 'A night shift ends the next day, so its end time must be earlier than its start time.';
  const length = shiftLengthMinutes(shift.startTime, shift.endTime, isNight);
  if ((shift.breakMinutes ?? 0) >= length) return 'The break is longer than the shift.';
  if (shift.halfDayMinutes && shift.fullDayMinutes && shift.halfDayMinutes >= shift.fullDayMinutes) return 'Half-day minutes must be less than full-day minutes.';
  if (shift.fullDayMinutes && shift.fullDayMinutes > length) return 'Full-day minutes are more than the shift is long.';
  return null;
};

