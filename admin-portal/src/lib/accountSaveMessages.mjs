export const getAccountSaveSuccessToast = (moduleName, mode) =>
  `${moduleName} ${mode === 'edit' ? 'updated' : 'created'} successfully.`;

export const getAccountSaveErrorToast = (moduleName) =>
  `Unable to save ${moduleName}. Please try again.`;
