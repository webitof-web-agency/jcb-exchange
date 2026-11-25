/**
 * The calendar day in India (Asia/Kolkata) as YYYY-MM-DD. This is the server's "today" for every HRM date rule
 * (joining, transfer, deactivate, appoint / replace a manager, assignment start), so the date fields default to it
 * and use it for their min / max. Between 00:00 and 05:30 IST the UTC day is still yesterday, which is why the UTC
 * day must not be used for this.
 */
export const indiaDay = (now: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
