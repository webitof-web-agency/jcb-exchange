import LegalPageRenderer from '@/components/legal/LegalPageRenderer';

export const metadata = {
  title: 'Terms & Conditions | JCB Exchange',
  description: 'Review the official Terms and Conditions of JCB Exchange.',
};

export default function TermsAndConditionsPage() {
  return (
    <LegalPageRenderer
      pageKey="termsConditions"
      title="Terms & Conditions"
      subtitle="Official user agreement and compliance guidelines for JCB Exchange marketplace platform."
    />
  );
}
