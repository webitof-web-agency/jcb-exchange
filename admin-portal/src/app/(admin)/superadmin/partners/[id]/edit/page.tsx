import KycOnboardingClient from '@/components/kyc/KycOnboardingClient';

export default async function SuperAdminPartnerOnboardingEditor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <KycOnboardingClient partnerId={id} />;
}
