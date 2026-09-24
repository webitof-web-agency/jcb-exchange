const DRIVE_FOLDER_TIME_ZONE = 'Asia/Kolkata';

const getDatePart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) => {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) {
    throw new Error(`Unable to determine upload ${type}.`);
  }

  return value;
};

export const getYearMonthFolderNames = (
  date: Date,
  timeZone = DRIVE_FOLDER_TIME_ZONE,
): { year: string; month: string } => {
  if (Number.isNaN(date.getTime())) {
    throw new Error('A valid upload date is required.');
  }

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date);
  const year = getDatePart(parts, 'year');
  const monthNumber = getDatePart(parts, 'month');
  const monthName = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'long',
  }).format(date);

  return {
    year,
    month: `${monthNumber}-${monthName}`,
  };
};
