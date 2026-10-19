export const getRtoDetailActionState = ({ canUpdate, isLocked }) => {
  const editable = Boolean(canUpdate && !isLocked);
  return {
    canEdit: editable,
    canChangeStatus: editable,
    mode: isLocked ? 'VIEW_ONLY' : 'EDITABLE',
  };
};
