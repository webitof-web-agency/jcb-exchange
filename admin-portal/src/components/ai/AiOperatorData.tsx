'use client';

type AiOperatorDataProps = {
  data: unknown;
};

export default function AiOperatorData({ data }: AiOperatorDataProps) {
  if (data === undefined || data === null) return null;

  let serialized = '';
  try {
    serialized = JSON.stringify(data, null, 2);
  } catch {
    return null;
  }
  if (!serialized) return null;

  return (
    <details open className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-2.5">
      <summary className="cursor-pointer text-[11px] font-bold text-amber-900">
        Authorized operational details
      </summary>
      <p className="mt-1.5 text-[10px] leading-4 text-amber-800">
        Live details from your permitted application scope. Credentials, payment secrets, government identifiers, and private file locators stay protected.
      </p>
      <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-white p-2.5 text-[10px] leading-4 text-slate-700">{serialized}</pre>
    </details>
  );
}
