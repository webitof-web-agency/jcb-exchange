export function isInterviewNotificationActive(
  scheduledAt: string,
  durationMinutes: number,
  now = Date.now(),
): boolean {
  const startsAt = new Date(scheduledAt).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(durationMinutes)) return false;

  const durationMs = Math.max(1, durationMinutes) * 60_000;
  return now >= startsAt - 10 * 60_000 && now <= startsAt + durationMs + 10 * 60_000;
}
