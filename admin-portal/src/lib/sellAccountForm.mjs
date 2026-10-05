export const normalizeAmountInput = (rawValue) => {
  const raw = String(rawValue ?? '').replace(/[^0-9.]/g, '');
  const normalizedRaw = raw === '.' ? '.' : raw;

  return {
    raw: normalizedRaw,
    value: normalizedRaw === '' || normalizedRaw === '.' ? 0 : Number.parseFloat(normalizedRaw) || 0,
  };
};

export const toEditableAmount = (value) => {
  const numericValue = Number(value) || 0;
  return numericValue === 0 ? '' : String(numericValue);
};

export const calculateSellAccountNetProfit = (sellAmount, purchaseAmount, expenses) =>
  (Number(sellAmount) || 0) - (Number(purchaseAmount) || 0) - (Number(expenses) || 0);

export const upsertSellAccountRecord = (records, record) => [
  record,
  ...records.filter((current) => current.id !== record.id),
];

export const createNextSellAccountId = (records, year = new Date().getFullYear()) => {
  const prefix = `SA-${year}-`;
  const highestSequence = records.reduce((highest, record) => {
    const id = String(record?.id || '');
    if (!id.startsWith(prefix)) return highest;
    const sequence = Number.parseInt(id.slice(prefix.length), 10);
    return Number.isFinite(sequence) ? Math.max(highest, sequence) : highest;
  }, 0);

  return `${prefix}${String(highestSequence + 1).padStart(3, '0')}`;
};

export const getSellAccountValidationErrors = (formData = {}, { isEditing = false } = {}) => {
  const errors = {};
  const text = (value) => String(value ?? '').trim();
  const digits = (value) => String(value ?? '').replace(/\D/g, '');

  if (!text(formData.ownerName)) errors.ownerName = 'Owner Name is required';
  if (digits(formData.ownerNumber).length < 10) errors.ownerNumber = 'Valid 10-digit phone required';
  if (!text(formData.vehicleNumber)) errors.vehicleNumber = 'Vehicle Number is required';
  if (!text(formData.vehicleType)) errors.vehicleType = 'Category is required';
  if (!isEditing && !text(formData.brandName)) errors.brandName = 'Brand is required';
  if (!text(formData.vehicleModel)) errors.vehicleModel = 'Vehicle Model is required';
  if (!text(formData.sellDate)) errors.sellDate = 'Sell Date is required';
  if (!text(formData.sellerName)) errors.sellerName = 'Seller Name is required';
  if (digits(formData.sellerNumber).length < 10) errors.sellerNumber = 'Valid 10-digit phone required';
  if (!text(formData.purchaserName)) errors.purchaserName = 'Purchaser Name is required';
  if (digits(formData.purchaserNumber).length < 10) errors.purchaserNumber = 'Valid 10-digit phone required';
  if (!(Number(formData.purchaseAmount) > 0)) errors.purchaseAmount = 'Purchase amount must be greater than 0';
  if (!(Number(formData.sellAmount) > 0)) errors.sellAmount = 'Sell amount must be greater than 0';
  if (!text(formData.dealStatus)) errors.dealStatus = 'Deal Status is required';
  if (!text(formData.transferDetails)) errors.transferDetails = 'Transfer Details are required';
  if (!text(formData.noteSheet)) errors.noteSheet = 'Remark is required';

  return errors;
};

export const replaceSellAccountRecord = (records, record) =>
  records.map((current) => current.id === record.id ? { ...current, ...record } : current);
