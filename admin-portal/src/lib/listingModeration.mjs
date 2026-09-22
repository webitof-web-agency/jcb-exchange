export const getPendingModerationOptions = () => ['APPROVE', 'REJECT'];

export const getModerationStatus = (action) => {
  if (action === 'APPROVE') {
    return 'PUBLISHED';
  }

  if (action === 'REJECT') {
    return 'CHANGES_REQUESTED';
  }

  return null;
};
