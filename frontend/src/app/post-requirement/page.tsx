import type { Metadata } from 'next';
import LeadCaptureForm, { type LeadCapturePrefill } from '@/components/crm/LeadCaptureForm';

export const metadata: Metadata = {
  title: 'Post Your Machine Requirement',
  description: "Can't find the right JCB or construction machine? Tell us what you need and JCB Exchange will call you with matching machines.",
  alternates: { canonical: '/post-requirement' },
  openGraph: {
    title: 'Post Your Machine Requirement | JCB Exchange',
    description: 'Tell us the machine, budget and location — we call you with verified matches.',
    url: 'https://jcbexchange.com/post-requirement',
    type: 'website',
  },
};

type PostRequirementPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const param = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)?.trim().slice(0, 120) || undefined;

// The machines page sends its filters here (?category=&brand=&budgetMax=&location=City, State).
const buildPrefill = (params: Record<string, string | string[] | undefined>): LeadCapturePrefill => {
  const [city, state] = (param(params.location) || '').split(',').map((part) => part.trim());
  const budget = param(params.budgetMax);
  return {
    categoryId: param(params.category),
    brandName: param(params.brand),
    budgetMax: budget && /^\d+$/.test(budget) ? budget : undefined,
    city: city || undefined,
    state: state || undefined,
  };
};

export default async function PostRequirementPage({ searchParams }: PostRequirementPageProps) {
  const prefill = buildPrefill((await searchParams) || {});
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10 sm:py-14">
      <div className="mx-auto max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#C99A1E]">Can&apos;t find a machine?</p>
        <h1 className="mt-2 text-3xl font-black text-gray-900 sm:text-4xl">Post your requirement</h1>
        <p className="mt-3 text-sm leading-6 text-gray-600">Tell us the machine, budget and where you need it. Our team calls you with verified options and alerts you when a matching machine is listed.</p>
        <div className="mt-8"><LeadCaptureForm mode="REQUIREMENT" prefill={prefill} /></div>
      </div>
    </main>
  );
}
