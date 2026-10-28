export const dedupeIdentityHistoryRecords = (records = []) => {
  const seenKeys = new Set();
  return records.filter((record) => {
    const key = `${record?._type || ''}:${record?.id || ''}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
};
