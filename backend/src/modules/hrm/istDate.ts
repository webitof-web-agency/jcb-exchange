/** Today's calendar date in India (Asia/Kolkata), as a UTC-midnight Date like the DATE columns. */
export const istToday = (now = new Date()) =>
  new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)}T00:00:00.000Z`);
