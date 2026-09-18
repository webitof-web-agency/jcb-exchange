import LegalPageRenderer from '@/components/legal/LegalPageRenderer';

export const metadata = {
  title: 'Privacy Policy | JCB Exchange',
  description: 'Review the Privacy Policy of JCB Exchange.',
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPageRenderer
      pageKey="privacyPolicy"
      title="Privacy Policy"
      subtitle="How we collect, protect, and handle your data across JCB Exchange."
    />
  );
}
