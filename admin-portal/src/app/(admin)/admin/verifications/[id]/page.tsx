import VerificationReviewPage from '@/components/verifications/VerificationReviewPage';

export default async function SuperAdminVerificationReview({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <VerificationReviewPage partnerId={id} />;
}
