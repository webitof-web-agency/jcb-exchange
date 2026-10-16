export const getPartnerOnboardingStepError = (
  stepId: string,
  profile: { partnerType?: string | null },
) => {
  if (stepId === 'profile' && !profile.partnerType?.trim()) {
    return 'Please select a partner type before continuing.';
  }

  return null;
};

export const getStepToKeepAfterDraftSave = (currentStep: number) =>
  Number.isInteger(currentStep) && currentStep >= 0 ? currentStep : 0;

export const getOnboardingProgressStep = (
  currentStep: number,
  stepCount: number,
  isComplete: boolean,
) => {
  const lastStep = Math.max(stepCount - 1, 0);
  if (isComplete) return lastStep;
  return Math.min(Math.max(currentStep, 0), lastStep);
};
