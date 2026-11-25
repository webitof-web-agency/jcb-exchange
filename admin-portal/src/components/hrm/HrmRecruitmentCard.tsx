'use client';

import { Briefcase } from 'lucide-react';
import type { HrmRecruitmentDetails } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus } from '@/lib/hrmUi';
import { describeAcceptanceMethod, formatInr, shortHash } from '@/lib/offerHrm';
import { formatIstDateTime, formatSubmittedValue, SUBMITTED_FIELD_LABELS } from '@/lib/hrmProfile';

const Row = ({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) => (
  <div className="flex justify-between gap-3 py-1.5 text-sm">
    <dt className="shrink-0 text-slate-500">{label}</dt>
    <dd className="min-w-0 text-right font-medium text-slate-900 break-words" title={title}>{value ?? '—'}</dd>
  </div>
);

/** How this person came in: the job, what they submitted, interviews, the offer and how it was accepted (read-only). */
export default function HrmRecruitmentCard({ recruitment }: { recruitment: HrmRecruitmentDetails }) {
  const submitted = recruitment.application.submitted ?? {};
  const details = SUBMITTED_FIELD_LABELS
    .map(([key, label, kind]) => ({ key, label, kind, value: formatSubmittedValue(submitted[key], kind) }))
    .filter((row) => row.value !== null);
  const monthly = recruitment.salaryComponents;
  const acceptance = recruitment.acceptance;
  return (
    <section id="hrm-recruitment" aria-labelledby="hrm-recruitment-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2"><Briefcase className="h-4 w-4 text-amber-600" aria-hidden="true" /><h2 id="hrm-recruitment-title" className="font-bold text-slate-950">Recruitment</h2></div>
      <div className="mt-3 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Application</p>
          <dl className="mt-1 divide-y divide-slate-100">
            <Row label="Job" value={recruitment.jobTitle} />
            <Row label="Job location" value={recruitment.jobLocation || '—'} />
            <Row label="Application" value={`${recruitment.application.applicationRef} · ${formatHrmDate(recruitment.application.appliedAt)}`} />
            <Row label="Stage" value={formatHrmStatus(recruitment.application.stage)} />
            {details.filter((row) => row.kind !== 'long').map((row) => <Row key={row.key} label={row.label} value={row.value} />)}
          </dl>
          {details.filter((row) => row.kind === 'long').map((row) => (
            <details key={row.key} className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-xs font-bold text-slate-700">{row.label}</summary>
              <p className="mt-2 whitespace-pre-line text-slate-700">{row.value}</p>
            </details>
          ))}
          {recruitment.application.answers.length ? (
            <details className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-xs font-bold text-slate-700">Answers ({recruitment.application.answers.length})</summary>
              <dl className="mt-2 space-y-2">{recruitment.application.answers.map((answer, index) => <div key={index}><dt className="text-xs font-semibold text-slate-600">{answer.question}</dt><dd className="text-slate-800">{answer.answer || '—'}</dd></div>)}</dl>
            </details>
          ) : null}
          {recruitment.application.interviews.length ? (
            <div className="mt-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Interviews</p>
              <ul className="mt-1 space-y-1 text-sm">{recruitment.application.interviews.map((interview) => <li key={interview.id} className="flex justify-between gap-3"><span className="text-slate-700">{formatHrmDate(interview.scheduledAt)} · {formatHrmStatus(interview.type)}</span><span className="text-slate-500">{formatHrmStatus(interview.status)}</span></li>)}</ul>
            </div>
          ) : null}
        </div>
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Offer{recruitment.letterNo ? ` · ${recruitment.letterNo}` : ''}</p>
          <dl className="mt-1 divide-y divide-slate-100">
            <Row label="Designation" value={recruitment.designation} />
            <Row label="Department" value={recruitment.department} />
            <Row label="Place of posting" value={recruitment.placeOfPosting} />
            <Row label="Joining date" value={formatHrmDate(recruitment.joiningDate)} />
            <Row label="Probation" value={recruitment.probationPeriod ? `${recruitment.probationPeriod} months` : '—'} />
            <Row label="Yearly CTC" value={recruitment.annualCtc !== null ? `₹${formatInr(recruitment.annualCtc)}` : '—'} />
          </dl>
          {monthly.length ? (
            <div className="mt-2 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-slate-500"><tr><th className="py-1 pr-3 font-semibold">Component</th><th className="py-1 pr-3 text-right font-semibold">Monthly</th><th className="py-1 text-right font-semibold">Yearly</th></tr></thead>
                <tbody className="divide-y divide-slate-100">{monthly.map((component) => <tr key={component.code}><td className="py-1 pr-3 text-slate-700">{component.name}</td><td className="py-1 pr-3 text-right text-slate-900">₹{formatInr(component.monthlyAmount)}</td><td className="py-1 text-right text-slate-900">₹{formatInr(component.monthlyAmount * 12)}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
          {acceptance ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">Acceptance</p>
              <dl className="mt-1">
                <Row label="Method" value={describeAcceptanceMethod(acceptance.method)} />
                <Row label="Name" value={acceptance.name || '—'} />
                <Row label="Place" value={acceptance.place || '—'} />
                <Row label="When" value={acceptance.method === 'OFFLINE_HR' ? formatHrmDate(acceptance.acceptedAt) : formatIstDateTime(acceptance.acceptedAt)} />
                {acceptance.ipAddress ? <Row label={acceptance.method === 'OFFLINE_HR' ? 'Recorded from' : 'IP address'} value={acceptance.ipAddress} /> : null}
                <Row label="Letter SHA-256" value={<span className="font-mono text-xs">{shortHash(acceptance.documentHash)}</span>} title={acceptance.documentHash ?? undefined} />
                {acceptance.signatureHash ? <Row label="Signature SHA-256" value={<span className="font-mono text-xs">{shortHash(acceptance.signatureHash)}</span>} title={acceptance.signatureHash} /> : null}
                {acceptance.note ? <Row label="HR note" value={acceptance.note} /> : null}
              </dl>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
