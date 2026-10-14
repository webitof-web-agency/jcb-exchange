export type VehicleListingVerificationSettings = {
  enabled: boolean;
  chassisEnabled: boolean;
  registrationEnabled: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export type VehicleListingVerificationSource = 'CHASSIS' | 'RC_FULL';

export const normalizeVehicleListingVerificationSettings = (
  settings?: Partial<VehicleListingVerificationSettings> | null,
): VehicleListingVerificationSettings => {
  // `enabled` was the original single chassis switch. Keep it as a read/write
  // compatibility field while making the two verification sources explicit.
  const chassisEnabled = settings?.chassisEnabled ?? settings?.enabled === true;
  const registrationEnabled = settings?.registrationEnabled === true;

  return {
    enabled: chassisEnabled || registrationEnabled,
    chassisEnabled,
    registrationEnabled,
    updatedAt: settings?.updatedAt || null,
    updatedByUserId: settings?.updatedByUserId || null,
  };
};

export const isVehicleListingVerificationEnabled = (
  settings: Partial<VehicleListingVerificationSettings> | null | undefined,
  source: VehicleListingVerificationSource,
) => {
  const normalized = normalizeVehicleListingVerificationSettings(settings);
  return source === 'RC_FULL' ? normalized.registrationEnabled : normalized.chassisEnabled;
};

export const shouldRequireVehicleListingVerification = (
  settings?: Partial<VehicleListingVerificationSettings> | null,
  canBypassVerification = false,
  source: VehicleListingVerificationSource = 'CHASSIS',
) => isVehicleListingVerificationEnabled(settings, source) && !canBypassVerification;
