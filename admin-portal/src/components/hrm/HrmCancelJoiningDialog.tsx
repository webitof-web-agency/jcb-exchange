'use client';

import { useState } from 'react';
import { Loader2, UserX } from 'lucide-react';
import { hrmApi } from '@/lib/hrmApi';
import { describeCancelOutcome, reasonProblem } from '@/lib/hrmOnboardingPage';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import HrmModal from './HrmModal';

const secondary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60';

/** Cancel joining (the person will not join): asks for the reason. Used on the Onboarding page and by "Change status". */
export default function HrmCancelJoiningDialog({ caseId, name, onClose, onDone }: { caseId: string; name: string; onClose: () => void; onDone: (message: string) => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const problem = reasonProblem(reason);
  const submit = async () => {
    if (saving) return;
    if (problem) { setError(problem); return; }
    setSaving(true);
    setError('');
    try {
      const response = await hrmApi.cancelJoining(caseId, reason.trim());
      onDone(describeCancelOutcome(response.data.employeeOutcome));
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'The joining could not be cancelled.'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <HrmModal
      title="Cancel joining"
      description={`${name} will not join.`}
      onClose={onClose}
      busy={saving}
      lockDismiss={saving || Boolean(reason.trim())}
      error={error}
      footer={<><button type="button" onClick={onClose} className={secondary} disabled={saving}>Keep</button><button type="button" onClick={() => void submit()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}Cancel joining</button></>}
    >
      <div className="space-y-3 text-sm text-slate-600">
        <p>Nothing is deleted. A record made for this offer is archived (it never joined); somebody re-hired on an earlier record goes back to <strong>Exited</strong>. The assignment, salary draft and shift made for this joining are cancelled, and the recruitment application is marked “Did not join”.</p>
        <label className="block text-sm font-semibold text-slate-700" htmlFor="hrm-cancel-joining-reason">Reason</label>
        <textarea id="hrm-cancel-joining-reason" value={reason} onChange={(event) => { setReason(event.target.value); setError(''); }} rows={3} maxLength={1000} className="w-full rounded-lg border border-slate-200 p-3 text-sm outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100" placeholder="For example: did not report on the joining date" />
      </div>
    </HrmModal>
  );
}
