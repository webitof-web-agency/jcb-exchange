export const getRtoActionVisibility = ({ canUpdateRto, canDeleteRto }) => {
  const showEdit = Boolean(canUpdateRto);
  const showDelete = Boolean(canDeleteRto);

  return {
    showActions: showEdit || showDelete,
    showEdit,
    showDelete,
  };
};

export const getRtoEditableFieldKeys = () => [
  'rtoExpenses',
  'rtoExpensesAdvance',
  'vehicleMaintenanceCost',
  'documentSendDate',
];
