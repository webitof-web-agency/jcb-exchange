'use client';

import type { HrmEmployee, HrmEmployeeOnboarding } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus } from '@/lib/hrmUi';
import { currentAssignmentOf, startsLater } from '@/lib/hrmProfile';
import { getActiveKycDocument } from '@/lib/hrmKyc';
import { getAssignmentLocation } from '@/lib/hrmDirectory';
import type { ProfileTab } from '@/lib/hrmProfileTabs';

function Card({ title, onOpen, openLabel, children }: { title: string; onOpen?: (() => void) | undefined; openLabel?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-bold text-slate-950">{title}</h2>
        {onOpen ? <button type="button" onClick={onOpen} className="text-xs font-semibold text-amber-700 hover:underline">{openLabel}</button> : null}
      </div>
      {children}
    </section>
  );
}

const Fact = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className="break-words font-semibold text-slate-800">{value || '—'}</dd></div>
);

/** The overview: the person's job, contact and KYC at a glance, each leading to its section. */
export default function HrmProfileSummary({
  employee,
  onboarding,
  canOpen,
  onOpen,
  onChangeManager,
}: {
  employee: HrmEmployee;
  onboarding: HrmEmployeeOnboarding | null;
  canOpen: (tab: ProfileTab) => boolean;
  onOpen: (tab: ProfileTab) => void;
  onChangeManager?: (() => void) | undefined;
}) {
  const assignment = currentAssignmentOf(employee.assignments);
  const link = (tab: ProfileTab) => (canOpen(tab) ? () => onOpen(tab) : undefined);
  const kyc = [
    { label: 'PAN', done: Boolean(getActiveKycDocument(employee.documents, 'PAN')), text: ['Verified', 'Pending'] },
    { label: 'Aadhaar', done: Boolean(getActiveKycDocument(employee.documents, 'AADHAAR')), text: ['Verified', 'Pending'] },
    { label: 'Bank', done: Boolean(employee.bankAccounts?.length), text: ['Added', 'Pending'] },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Job" onOpen={link('job')} openLabel="Open Job">
        {assignment && startsLater(assignment) ? <p className="mt-1 text-xs font-semibold text-amber-700">Starts on {formatHrmDate(assignment.effectiveFrom)}</p> : null}
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Fact label="Designation" value={assignment?.designation} />
          <Fact label="Department" value={assignment?.orgUnit?.name} />
          <Fact label="Office" value={assignment?.officeUnit?.name} />
          <Fact label="Location" value={assignment ? getAssignmentLocation(assignment) : ''} />
          <Fact
            label="Reports to"
            value={(
              <span className="flex flex-wrap items-center gap-x-2">
                {assignment?.managerEmployee?.legalName ?? <span className="font-normal italic text-slate-500">Not set</span>}
                {onChangeManager ? <button type="button" onClick={onChangeManager} aria-label="Change reporting manager" className="text-xs font-semibold text-amber-700 hover:underline">{assignment?.managerEmployee ? 'Change' : 'Set'}</button> : null}
              </span>
            )}
          />
          <Fact label="Joining date" value={employee.joinedOn ? formatHrmDate(employee.joinedOn) : ''} />
        </dl>
      </Card>
      <Card title="Contact & login" onOpen={link('personal')} openLabel="Open Personal">
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Fact label="Work email" value={employee.workEmail} />
          <Fact label="Mobile" value={employee.mobile} />
          <Fact label="Personal email" value={employee.personalEmail} />
          <Fact label="Login" value={employee.user ? formatHrmStatus(employee.user.status) : 'No login yet'} />
          {onboarding?.recruitment?.letterNo ? <Fact label="Offer reference" value={onboarding.recruitment.letterNo} /> : null}
        </dl>
      </Card>
      {employee.documentsVisible !== false && canOpen('kyc') ? (
        <Card title="KYC & bank" onOpen={link('kyc')} openLabel="Open KYC & Bank">
          <div className="mt-3 grid grid-cols-3 gap-2">
            {kyc.map((item) => (
              <div key={item.label} className={`rounded-xl border px-3 py-2 text-center ${item.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <p className="text-xs font-semibold text-slate-700">{item.label}</p>
                <p className={`mt-0.5 text-[11px] font-semibold ${item.done ? 'text-emerald-700' : 'text-slate-400'}`}>{item.done ? item.text[0] : item.text[1]}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
