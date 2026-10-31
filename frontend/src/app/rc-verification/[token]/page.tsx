type VerificationResponse = {
  success: boolean;
  verification?: {
    verified: boolean;
    maskedRcNumber: string;
    ownerName: string | null;
    rcStatus: string | null;
    vehicleCategory: string | null;
    registrationDate: string | null;
    completedAt: string | null;
  };
  error?: string;
};

const apiBaseUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002/api').replace(/\/+$/, '');

export default async function RcVerificationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let result: VerificationResponse = { success: false, error: 'Verification link is unavailable.' };

  try {
    const response = await fetch(`${apiBaseUrl}/public/rc-verifications/${encodeURIComponent(token)}`, { cache: 'no-store' });
    result = (await response.json()) as VerificationResponse;
  } catch {
    result = { success: false, error: 'Verification service is temporarily unavailable.' };
  }

  const verification = result.verification;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
      <section className="mx-auto max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="bg-slate-900 px-6 py-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">JCB Exchange</p>
          <h1 className="mt-2 text-2xl font-extrabold">RC Verification</h1>
        </div>
        {verification?.verified ? (
          <div className="space-y-5 p-6">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800">
              <p className="font-extrabold">✓ Verified record</p>
              <p className="mt-1 text-sm">This QR link matches an RC verification record.</p>
            </div>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">RC Number</dt><dd className="mt-1 font-bold">{verification.maskedRcNumber}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">RC Status</dt><dd className="mt-1 font-bold">{verification.rcStatus || 'Verified'}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Owner</dt><dd className="mt-1 font-semibold">{verification.ownerName || 'Not available'}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Vehicle Class</dt><dd className="mt-1 font-semibold">{verification.vehicleCategory || 'Not available'}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wide text-slate-500">Registration Date</dt><dd className="mt-1 font-semibold">{verification.registrationDate || 'Not available'}</dd></div>
            </dl>
          </div>
        ) : (
          <div className="p-6"><p className="font-bold text-red-700">{result.error || 'Verification failed.'}</p></div>
        )}
      </section>
    </main>
  );
}
