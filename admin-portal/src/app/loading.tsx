import BrandLoader from '@/components/ui/BrandLoader';
import { getPortalBranding } from '@/lib/siteBranding';

export default async function Loading() {
  const branding = await getPortalBranding();

  return (
    <BrandLoader
      variant="fullscreen"
      size="lg"
      bg="light"
      initialLogoUrl={branding.darkLogoUrl}
    />
  );
}
