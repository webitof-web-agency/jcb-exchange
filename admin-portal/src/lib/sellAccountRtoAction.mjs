export const getSellAccountRtoActionState = ({
  hasEditingRecord = false,
  canEditSellAccount = false,
  canManageRto = false,
  isDraft = false,
  hasRtoRecord = false,
  purchaserPaymentStatus = 'NONE',
} = {}) => {
  const visible = Boolean(hasEditingRecord && canEditSellAccount);
  const disabled = !visible || !canManageRto || isDraft || (!hasRtoRecord && purchaserPaymentStatus !== 'FULL');

  return {
    visible,
    disabled,
    label: !canManageRto
      ? 'RTO permission required'
      : isDraft
      ? 'Save Record to Start RTO'
      : hasRtoRecord
        ? 'Open RTO Work'
        : 'Start RTO Work',
  };
};

export const shouldShowSaveAndStartRto = ({
  requested = false,
  canManageRto = false,
  hasRtoRecord = false,
  purchaserPaymentStatus = 'NONE',
} = {}) => Boolean(
  requested &&
  canManageRto &&
  !hasRtoRecord &&
  purchaserPaymentStatus === 'FULL',
);
