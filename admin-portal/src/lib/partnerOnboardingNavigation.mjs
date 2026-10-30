export const saveBeforeStepAdvance = async ({
  currentStep,
  targetStep,
  validate,
  save,
}) => {
  if (targetStep <= currentStep) {
    return { advanced: true, saved: false, targetStep };
  }

  const error = validate();
  if (error) {
    return { advanced: false, saved: false, error };
  }

  const saved = await save();
  if (saved === false) {
    return { advanced: false, saved: false };
  }

  return { advanced: true, saved: true, targetStep };
};

