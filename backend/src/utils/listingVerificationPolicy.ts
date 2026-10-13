export type VehicleListingVerificationSettings = {
  enabled: boolean;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export const normalizeVehicleListingVerificationSettings = (
  settings?: Partial<VehicleListingVerificationSettings> | null,
): VehicleListingVerificationSettings => ({
  enabled: settings?.enabled === true,
  updatedAt: settings?.updatedAt || null,
  updatedByUserId: settings?.updatedByUserId || null,
});

export const shouldRequireVehicleListingVerification = (
  settings?: Pick<VehicleListingVerificationSettings, 'enabled'> | null,
  canBypassVerification = false,
) => settings?.enabled === true && !canBypassVerification;
