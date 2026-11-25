'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { hrmApi, type HrmLinkableUser } from '@/lib/hrmApi';
import { getHrmErrorMessage } from '@/lib/hrmUi';
import HrmLoginPicker, { type LoginNote } from './HrmLoginPicker';
import HrmModal from './HrmModal';

/**
 * Attaches an existing employee login (created earlier on the Users page) to an HR record that has none, for example
 * one that came from a recruitment offer. The other direction, "HR record for an existing login", is in Add Employee.
 */
export default function HrmLinkLoginDialog({ employee, onClose, onLinked }: {
  employee: { id: string; employeeCode: string; name: string };
  onClose: () => void;
  /** Called after the login was linked; the page reloads the profile. */
  onLinked: () => void | Promise<void>;
}) {
  const [selected, setSelected] = useState<HrmLinkableUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // A login that matches a different person's HR record is most likely somebody else's account.
  const getNote = (user: HrmLinkableUser): LoginNote => {
    const match = user.matchingEmployee;
    if (!match) return null;
    if (match.id === employee.id) return { text: `Its email or mobile matches ${employee.employeeCode}: this looks like the right login.`, blocked: false };
    return { text: `Its email or mobile matches HR record ${match.employeeCode} (${match.name}). Link it there instead.`, blocked: true };
  };

  const link = async () => {
    if (!selected || saving) return;
    setSaving(true);
    setError('');
    try {
      await hrmApi.linkLoginToEmployee(employee.id, selected.id);
      await onLinked();
    } catch (requestError) {
      setError(getHrmErrorMessage(requestError, 'Unable to link the login.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <HrmModal
      title="Link existing login"
      description={`Choose the login ${employee.name} (${employee.employeeCode}) signs in with. Nothing new is created: the login keeps its password and permission role.`}
      onClose={onClose}
      busy={saving}
      error={error}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="h-10 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Cancel</button>
          <button type="button" onClick={() => void link()} disabled={!selected || saving} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-bold text-slate-950 shadow-sm hover:bg-amber-500 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{saving ? 'Linking…' : 'Link login'}
          </button>
        </>
      )}
    >
      <HrmLoginPicker idPrefix="hrm-link-login" selected={selected} onSelect={(user) => { setSelected(user); setError(''); }} onClear={() => { setSelected(null); setError(''); }} getNote={getNote} disabled={saving} />
    </HrmModal>
  );
}
