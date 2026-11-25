'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, KeyRound, Link2, Loader2, Save, UserRound } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { hrmApi, type HrmAttendanceRecord, type HrmChecklistItem, type HrmDocumentCategory, type HrmEmployee, type HrmEmployeeOnboarding, type HrmExitCase, type HrmIncentive, type HrmLeaveRequest, type HrmPerformanceReview } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus, getHrmErrorMessage, getHrmModuleTab, hasHrmPermission } from '@/lib/hrmUi';
import { getHrmProfileAbilities, getHrmProfileReads, HRM_NO_ACCESS_MESSAGE, isHrmForbidden, SELF_ACTION_HINT } from '@/lib/hrmAccess';
import { indiaDay } from '@/lib/hrmDay';
import HrmEmployeeKycPanel from './HrmEmployeeKycPanel';
import HrmAddAssignmentDialog from './HrmAddAssignmentDialog';
import HrmLinkLoginDialog from './HrmLinkLoginDialog';
import HrmResetPasswordDialog from './HrmResetPasswordDialog';
import { buildIdentityPatch, describeLoginStatusHint, describeSaveNotice, detectIdentityChanges, getLoginStatusClass, mergeProfileForm, toProfileForm, validateIdentity, type IdentityErrors, type ProfileForm } from '@/lib/hrmLogin';
import { DeactivateDialog, TransferDialog } from './HrmLifecycleDialogs';
import { describeReactivation } from '@/lib/hrmAssignment';
import { describeMoveResult } from '@/lib/hrmLifecycle';
import { getActiveKycDocument } from '@/lib/hrmKyc';
import { getAssignmentLocation } from '@/lib/hrmDirectory';
import { CHECKLIST_TARGET, describeStatusChangeRefusal, profileStatusControl } from '@/lib/hrmProfile';
import HrmJoiningChecklistCard from './HrmJoiningChecklistCard';
import HrmRecruitmentCard from './HrmRecruitmentCard';
import HrmPersonalDetailsCard from './HrmPersonalDetailsCard';
import HrmConfirmJoiningDialog from './HrmConfirmJoiningDialog';
import HrmAccessCard from './HrmAccessCard';
import HrmSalaryCard from './HrmSalaryCard';
import HrmShiftCard from './HrmShiftCard';
import HrmDocumentsCard from './HrmDocumentsCard';

/** People who have not joined yet (or whose onboarding is still open) see the joining checklist first. */
const JOINING_STATUSES = new Set(['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING']);
const OPEN_CASE_STATUSES = new Set(['PENDING', 'NEEDS_REVIEW', 'IN_PROGRESS', 'READY_FOR_APPROVAL']);

const scrollToCard = (id: string) => {
  window.requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
};

type HrmEmployeeDetailProps = { id: string; portal: 'admin' | 'employee' };
type DetailTab = 'overview' | 'kyc' | 'attendance' | 'leave' | 'compensation' | 'performance' | 'exit';

const tabs: Array<{ id: DetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'kyc', label: 'KYC & Bank' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'leave', label: 'Leave' },
  { id: 'compensation', label: 'Compensation' },
  { id: 'performance', label: 'Performance & incentives' },
  { id: 'exit', label: 'Exit' },
];

export default function HrmEmployeeDetail({ id, portal }: HrmEmployeeDetailProps) {
  const { user } = useAuthStore();
  const [employee, setEmployee] = useState<HrmEmployee | null>(null);
  const [attendance, setAttendance] = useState<HrmAttendanceRecord[]>([]);
  const [leave, setLeave] = useState<HrmLeaveRequest[]>([]);
  const [performance, setPerformance] = useState<HrmPerformanceReview[]>([]);
  const [incentives, setIncentives] = useState<HrmIncentive[]>([]);
  const [exitCases, setExitCases] = useState<HrmExitCase[]>([]);
  const [selectedTab, setSelectedTab] = useState<DetailTab | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [linkLoginOpen, setLinkLoginOpen] = useState(false);
  const [confirmJoiningOpen, setConfirmJoiningOpen] = useState(false);
  const [accessRefresh, setAccessRefresh] = useState(0);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [identityErrors, setIdentityErrors] = useState<IdentityErrors>({});
  const [lifecycleDialog, setLifecycleDialog] = useState<'transfer' | 'deactivate' | null>(null);
  const [addAssignmentOpen, setAddAssignmentOpen] = useState(false);
  const [edit, setEdit] = useState<ProfileForm>({ preferredName: '', workEmail: '', mobile: '', status: 'DRAFT', version: 1 });
  /** What the server last said the editable fields are: a reload only overwrites the fields still equal to it. */
  const serverFormRef = useRef<ProfileForm | null>(null);
  const [onboarding, setOnboarding] = useState<HrmEmployeeOnboarding | null>(null);
  const [personalEditing, setPersonalEditing] = useState(false);
  const [salaryProposing, setSalaryProposing] = useState(false);
  const [shiftAssigning, setShiftAssigning] = useState(false);
  const [documentUpload, setDocumentUpload] = useState<{ category: HrmDocumentCategory } | null>(null);
  /** Lists the viewer may not read (no permission, or the server answered 403). */
  const [denied, setDenied] = useState<Record<'attendance' | 'leave' | 'performance' | 'incentives' | 'exit', boolean>>({ attendance: false, leave: false, performance: false, incentives: false, exit: false });
  /** The linked login's account role, from the Access card (Reset password / login fields are for EMPLOYEE logins only). */
  const [loginRole, setLoginRole] = useState<string | null | undefined>(undefined);
  const [attendanceForm, setAttendanceForm] = useState({ attendanceDate: indiaDay(), status: 'PRESENT', notes: '' });
  const [leaveForm, setLeaveForm] = useState({ leaveTypeId: '', startDate: '', endDate: '', units: '1', reason: '' });
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  // Every control follows the endpoint behind it (hrmAccess.ts): its permission, the own-record rule (HR actions on
  // yourself are done by somebody else), the leaver rule (EXITED / TERMINATED) and archived = read-only.
  const abilities = getHrmProfileAbilities(user, {
    archived: Boolean(employee?.archivedAt),
    status: employee?.status ?? 'DRAFT',
    ownLogin: Boolean(employee?.user && user && employee.user.id === user.id),
    hasLogin: Boolean(employee?.user),
    // The profile now carries the login's role; the Access card's answer (when loaded) is the same value.
    loginRole: loginRole ?? employee?.user?.role,
    documentsVisible: employee?.documentsVisible,
    openCase: OPEN_CASE_STATUSES.has(onboarding?.case?.status ?? ''),
    hasOpenAssignment: (employee?.assignments ?? []).some((assignment) => assignment.status === 'ACTIVE' && !assignment.effectiveTo),
  });
  const writable = abilities.writable;
  const canEditProfile = abilities.editProfile;
  const canMarkAttendance = abilities.markAttendance;
  const canSubmitLeave = abilities.submitLeave;
  const canManageKyc = abilities.manageKyc;
  const canViewKycDocuments = abilities.read.documentFiles;
  const canTransfer = abilities.transfer;
  const canAddAssignment = abilities.addAssignment;
  const canDeactivate = abilities.deactivate;
  const canReactivate = abilities.reactivate;
  const canEditLoginIdentity = abilities.editLoginIdentity;
  const canLinkLogin = abilities.linkLogin;
  const canConfirmJoining = abilities.confirmJoining;
  const canVerifyDocuments = abilities.verifyDocuments;
  const canReadSalary = abilities.read.salary;
  const canProposeSalary = abilities.proposeSalary;
  const canApproveSalary = abilities.approveSalary;
  const canViewShift = abilities.read.shift;
  const canAssignShift = abilities.assignShift;
  const reads = useMemo(() => getHrmProfileReads(user), [user]);
  const visibleTabs = tabs.filter((item) => item.id === 'overview' || abilities.tabs[item.id]);

  const routeTab = useSyncExternalStore(
    () => () => undefined,
    () => getHrmModuleTab(new URLSearchParams(window.location.search).get('module')),
    () => 'overview',
  );
  const requestedTab = selectedTab ?? routeTab;
  // A tab the viewer may not see (for example ?module=kyc without document access) opens the overview.
  const tab: DetailTab = visibleTabs.find((item) => item.id === requestedTab)?.id ?? 'overview';

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    if (!options.silent) { setLoading(true); setError(''); }
    try {
      const base = await hrmApi.getEmployee(id);
      const nextEmployee = base.data.employee;
      setEmployee(nextEmployee);
      // A refresh after Transfer, Add assignment, Link login, KYC and so on must not wipe what is typed but not saved:
      // only the fields the person has not touched take the new server value (the version always does).
      const fresh = toProfileForm(nextEmployee);
      const previous = serverFormRef.current;
      setEdit((current) => mergeProfileForm(current, previous, fresh));
      serverFormRef.current = fresh;
      // Only the lists the viewer may read are asked for; a 403 is remembered and shown as "no access", not "no records".
      const skip = Promise.resolve(null);
      const results = await Promise.allSettled([
        reads.attendance ? hrmApi.listAttendance(id) : skip,
        reads.leave ? hrmApi.listLeave(id) : skip,
        hrmApi.getEmployeeOnboarding(id),
        reads.performance ? hrmApi.listPerformance(id) : skip,
        reads.incentives ? hrmApi.listIncentives(id) : skip,
        reads.exit ? hrmApi.listExit(id) : skip,
      ]);
      const [attendanceResult, leaveResult, onboardingResult, performanceResult, incentiveResult, exitResult] = results;
      const forbidden = (result: PromiseSettledResult<unknown>) => result.status === 'rejected' && isHrmForbidden(result.reason);
      setDenied({
        attendance: !reads.attendance || forbidden(attendanceResult),
        leave: !reads.leave || forbidden(leaveResult),
        performance: !reads.performance || forbidden(performanceResult),
        incentives: !reads.incentives || forbidden(incentiveResult),
        exit: !reads.exit || forbidden(exitResult),
      });
      if (attendanceResult.status === 'fulfilled' && attendanceResult.value) setAttendance(attendanceResult.value.data.attendance || []);
      if (leaveResult.status === 'fulfilled' && leaveResult.value) setLeave(leaveResult.value.data.leave || []);
      if (onboardingResult.status === 'fulfilled') setOnboarding(onboardingResult.value.data.onboarding ?? null);
      if (performanceResult.status === 'fulfilled' && performanceResult.value) setPerformance(performanceResult.value.data.performance || []);
      if (incentiveResult.status === 'fulfilled' && incentiveResult.value) setIncentives(incentiveResult.value.data.incentives || []);
      if (exitResult.status === 'fulfilled' && exitResult.value) setExitCases(exitResult.value.data.exit || []);
    } catch (requestError) {
      const message = getHrmErrorMessage(requestError, 'Unable to load this employee record.');
      // A refresh that fails after something was saved keeps the page as it is: the save worked, only the re-read did not.
      if (options.silent) toast.error(`${message} What is on screen may be out of date; reload the page to see the latest.`);
      else setError(message);
    } finally {
      setLoading(false);
    }
  }, [id, reads]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const reactivate = async () => {
    if (!employee) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const response = await hrmApi.reactivateEmployee(employee.id);
      setNotice(describeReactivation({ employeeCode: employee.employeeCode, loginEnabled: Boolean(response.data.loginEnabled) }));
      await load({ silent: true });
    } catch (requestError) { setError(getHrmErrorMessage(requestError, 'Unable to reactivate this employee.')); }
    finally { setSaving(false); }
  };

  const saveEmployee = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!employee || saving) return;
    setError(''); setNotice('');
    const hasLogin = Boolean(employee.user);
    // Somebody without Users access cannot change a login's email or mobile: those two fields are not sent at all.
    const identityLocked = hasLogin && !canEditLoginIdentity;
    const baseline = { workEmail: employee.workEmail, mobile: employee.mobile };
    const typed = { workEmail: edit.workEmail, mobile: edit.mobile };
    const problems = identityLocked ? {} : validateIdentity(typed, baseline, hasLogin);
    setIdentityErrors(problems);
    if (Object.keys(problems).length) { setError('Please correct the highlighted fields. Nothing was saved.'); return; }
    const changes = identityLocked ? { email: false, mobile: false } : detectIdentityChanges(typed, baseline);
    setSaving(true);
    try {
      const response = await hrmApi.updateEmployee(id, {
        preferredName: edit.preferredName || null,
        ...(identityLocked ? {} : buildIdentityPatch(typed, baseline, hasLogin)),
        // Only the working states are changed here (joining / lifecycle moves have their own flows).
        ...(edit.status !== employee.status && profileStatusControl(employee.status).editable ? { status: edit.status } : {}),
        version: edit.version,
      });
      const ownLogin = Boolean(employee.user && user && employee.user.id === user.id);
      const stored = response.data.employee;
      // For somebody with a login the email and mobile shown are the login's: take the saved ones only when they were changed.
      const merged = {
        ...employee,
        ...stored,
        ...(hasLogin ? { workEmail: changes.email ? stored.workEmail : employee.workEmail, mobile: changes.mobile ? stored.mobile : employee.mobile } : {}),
      };
      setEmployee(merged);
      const saved = toProfileForm(merged);
      serverFormRef.current = saved;
      setEdit(saved);
      setNotice(describeSaveNotice(changes, { hasLogin, ownLogin }));
      // The login now holds the normalised email / mobile: read them back so the card and the form show what is stored.
      // (When it is the signed-in person's own login every session ended, so there is nothing to reload.)
      if (hasLogin && (changes.email || changes.mobile) && !ownLogin) await load({ silent: true });
    } catch (requestError) {
      // The typed values stay in the form so they can be corrected; the server's reason (409 in use, 403, 400, version) is shown.
      setError(describeStatusChangeRefusal(requestError) ?? getHrmErrorMessage(requestError, 'Unable to save employee details.'));
    } finally { setSaving(false); }
  };

  /** Whether the viewer can complete this checklist item themselves ("Complete" is shown only then). */
  const canCompleteChecklistItem = (item: HrmChecklistItem) => {
    const target = CHECKLIST_TARGET[item.key];
    if (!target) return false;
    if (target.card === 'personal') return abilities.editPersonal;
    if (target.card === 'assignment') return canAddAssignment;
    if (target.card === 'kyc') return abilities.tabs.kyc && canManageKyc;
    if (target.card === 'documents') return abilities.documentsVisible && abilities.uploadDocuments;
    if (target.card === 'salary') return canReadSalary && canProposeSalary;
    if (target.card === 'shift') return canViewShift && canAssignShift;
    return false;
  };

  /** "Complete" on a checklist item: open the place where it is done. */
  const completeChecklistItem = (item: HrmChecklistItem) => {
    const target = CHECKLIST_TARGET[item.key];
    if (!target || !canCompleteChecklistItem(item)) return;
    if (target.card === 'kyc') { setSelectedTab('kyc'); return; }
    setSelectedTab('overview');
    if (target.card === 'personal') { setPersonalEditing(true); scrollToCard('hrm-personal-details'); return; }
    if (target.card === 'assignment') { setAddAssignmentOpen(true); return; }
    if (target.card === 'documents') { setDocumentUpload({ category: target.category ?? 'OTHER' }); return; }
    if (target.card === 'salary') { setSalaryProposing(true); scrollToCard('hrm-salary'); return; }
    if (target.card === 'shift') { setShiftAssigning(true); scrollToCard('hrm-shift'); }
  };

  const markAttendance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try { await hrmApi.upsertAttendance(id, attendanceForm); setNotice('Attendance saved.'); await load(); }
    catch (requestError) { setError(getHrmErrorMessage(requestError, 'Unable to save attendance.')); }
    finally { setSaving(false); }
  };

  const submitLeave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try { await hrmApi.createLeave(id, { ...leaveForm, units: Number(leaveForm.units), idempotencyKey: `portal-${id}-${leaveForm.startDate}-${Date.now()}` }); setLeaveForm({ leaveTypeId: '', startDate: '', endDate: '', units: '1', reason: '' }); setNotice('Leave request submitted.'); await load(); }
    catch (requestError) { setError(getHrmErrorMessage(requestError, 'Unable to submit leave request.')); }
    finally { setSaving(false); }
  };

  const summary = useMemo(() => employee ? `${employee.employeeCode} · ${formatHrmStatus(employee.status)}` : 'Employee record', [employee]);

  if (loading) return <main className="flex min-h-full items-center justify-center bg-slate-50 p-8"><Loader2 className="h-6 w-6 animate-spin text-amber-500" aria-label="Loading employee" /></main>;
  if (!employee) return <main className="min-h-full bg-slate-50 p-8"><div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error || 'Employee not found.'}</div></main>;

  const hasLogin = Boolean(employee.user);
  const loginHint = describeLoginStatusHint(employee.user?.status);
  const canResetPassword = abilities.resetPassword;
  const onboardingHref = `/${portal}/hrm/onboarding`;
  const noAccess = <p className="py-6 text-sm text-slate-500">{HRM_NO_ACCESS_MESSAGE}</p>;

  return (
    <main className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <Link href={`/${portal}/hrm`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-amber-700"><ArrowLeft className="h-4 w-4" /> Back to HRM</Link>
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="flex items-start gap-3"><div className="rounded-xl bg-amber-100 p-3 text-amber-700"><UserRound className="h-6 w-6" /></div><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-600">Employee profile</p><h1 className="mt-1 text-2xl font-bold text-slate-950">{employee.preferredName || employee.legalName}</h1><p className="mt-1 text-sm text-slate-500">{summary}</p></div></div><div className="flex flex-wrap items-center gap-2" data-slot="employee-header-actions">{canConfirmJoining ? <button type="button" onClick={() => setConfirmJoiningOpen(true)} className="inline-flex min-h-9 items-center rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700">Confirm joining</button> : null}{canTransfer ? <button type="button" onClick={() => setLifecycleDialog('transfer')} className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50">Transfer</button> : null}{canDeactivate ? <button type="button" onClick={() => setLifecycleDialog('deactivate')} className="inline-flex min-h-9 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50">Deactivate</button> : abilities.useCancelJoining ? <Link href={onboardingHref} title="This person has not joined yet: a no-show is closed with Cancel joining on the Onboarding page." className="inline-flex min-h-9 items-center rounded-lg border border-rose-200 bg-white px-3 text-xs font-bold text-rose-700 hover:bg-rose-50">Cancel joining (Onboarding)</Link> : null}{employee.status === 'SUSPENDED' && canReactivate ? <button type="button" disabled={saving} onClick={() => void reactivate()} className="inline-flex min-h-9 items-center rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">Reactivate</button> : null}<span className="inline-flex w-fit rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">{employee.source === 'RECRUITMENT' ? 'Recruitment linked' : 'Direct HR'}</span></div></div></header>
        {employee.archivedAt ? <div role="status" className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> <span><strong>Archived</strong> — this person never joined (record kept for history, archived on {formatHrmDate(employee.archivedAt)}). Nothing on it can be changed.</span></div> : null}
        {abilities.own && writable ? <div role="note" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span><strong>Your own HR record.</strong> Approvals, verification, access, joining, attendance, salary, KYC &amp; bank, shift, transfer and assignments on it are {SELF_ACTION_HINT.toLowerCase()}. You can still update your personal details, request leave and upload documents.</span></div> : null}
        {abilities.left && writable ? <div role="note" className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> <span><strong>Has left the company.</strong> Attendance, leave requests, salary, KYC &amp; bank, shift, performance and incentives can no longer be changed. Documents (upload and verification), leave decisions and the exit case still can.</span></div> : null}
        {error ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div> : null}
        {notice ? <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}</div> : null}
        <nav className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm" aria-label="Employee modules">{visibleTabs.map((item) => <button type="button" key={item.id} onClick={() => setSelectedTab(item.id)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition ${tab === item.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{item.label}</button>)}</nav>

        {tab === 'overview' && onboarding && (JOINING_STATUSES.has(employee.status) || OPEN_CASE_STATUSES.has(onboarding.case?.status ?? '')) ? <HrmJoiningChecklistCard onboarding={onboarding} portal={portal} onAction={completeChecklistItem} canAct={canCompleteChecklistItem} readOnly={!writable} canOpenOnboarding={abilities.openOnboarding} /> : null}

        {tab === 'overview' ? <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-5"><form onSubmit={saveEmployee} noValidate className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-slate-950">Core employee details</h2>{canEditProfile ? <button disabled={saving} type="submit" className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white disabled:opacity-60"><Save className="h-3.5 w-3.5" /> Save</button> : null}</div><div className="grid gap-4 sm:grid-cols-2">{[['preferredName', 'Preferred name'], ['workEmail', hasLogin ? 'Work email (login)' : 'Work email'], ['mobile', hasLogin ? 'Mobile (login)' : 'Mobile']].map(([key, label]) => {
              const isLoginField = hasLogin && key !== 'preferredName';
              const locked = !canEditProfile || (isLoginField && !canEditLoginIdentity);
              const problem = key === 'preferredName' ? undefined : identityErrors[key as keyof IdentityErrors];
              const what = key === 'workEmail' ? 'email' : 'mobile';
              return <label key={key} className="text-xs font-semibold text-slate-700">{label}<input disabled={locked} type={key === 'workEmail' ? 'email' : 'text'} inputMode={key === 'mobile' ? 'tel' : undefined} autoComplete="off" aria-invalid={Boolean(problem)} value={edit[key as keyof typeof edit] as string} onChange={(event) => { setEdit((current) => ({ ...current, [key]: event.target.value })); if (problem) setIdentityErrors((current) => ({ ...current, [key]: undefined })); }} className={`mt-1 min-h-10 w-full rounded-lg border px-3 text-sm font-normal outline-none focus:border-amber-400 disabled:bg-slate-50 ${problem ? 'border-rose-300' : 'border-slate-200'}`} />{problem ? <span role="alert" className="mt-1 block text-[11px] font-medium text-rose-600">{problem}</span> : isLoginField ? <span className="mt-1 block text-[11px] font-normal text-slate-500">{canEditLoginIdentity ? `This is also the login ${what}. Changing it signs the person out everywhere; they sign in with the new value.` : loginRole === 'ADMIN' || loginRole === 'SUPER_ADMIN' ? `This is an administrator login: its ${what} is changed on the Users screen.` : abilities.own ? `This is your login ${what}: it is changed by another HR user.` : `This is the login ${what}. Someone with Users access changes it.`}</span> : null}</label>;
            })}<label className="text-xs font-semibold text-slate-700">Status<select disabled={!canEditProfile || !profileStatusControl(employee.status).editable} value={edit.status} onChange={(event) => setEdit((current) => ({ ...current, status: event.target.value }))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-normal outline-none disabled:bg-slate-50">{profileStatusControl(employee.status).options.map((value) => <option key={value} value={value}>{formatHrmStatus(value)}</option>)}</select><span className="mt-1 block text-[11px] font-normal text-slate-500">{profileStatusControl(employee.status).hint}</span></label></div><dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Legal name</dt><dd className="font-semibold text-slate-800">{employee.legalName}</dd></div><div><dt className="text-xs text-slate-500">Joining date</dt><dd className="font-semibold text-slate-800">{formatHrmDate(employee.joinedOn)}</dd></div><div><dt className="text-xs text-slate-500">Personal email</dt><dd className="font-semibold text-slate-800">{employee.personalEmail || '—'}</dd></div><div><dt className="text-xs text-slate-500">Offer reference</dt><dd className="font-semibold text-slate-800">{onboarding?.recruitment?.letterNo || (employee.offerId ? 'Recruitment offer' : '—')}</dd></div></dl></form>
          <HrmPersonalDetailsCard
            employee={employee}
            canEdit={abilities.editPersonal}
            lockDateOfBirth={abilities.lockDateOfBirth}
            editing={personalEditing}
            onEditingChange={setPersonalEditing}
            onSaved={(next) => { setEmployee(next); const fresh = toProfileForm(next); serverFormRef.current = fresh; setEdit((current) => ({ ...current, version: fresh.version })); void load({ silent: true }); }}
            onConflict={() => load({ silent: true })}
          />
          {onboarding?.recruitment ? <HrmRecruitmentCard recruitment={onboarding.recruitment} /> : null}
          </div>
          <div className="space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="font-bold text-slate-950">Login account</h2>{canResetPassword ? <button type="button" onClick={() => setResetPasswordOpen(true)} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-800 hover:bg-slate-50"><KeyRound className="h-3.5 w-3.5 text-amber-600" /> Reset password</button> : null}</div>{employee.user ? <><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-slate-500">Email</dt><dd className="min-w-0 truncate font-medium text-slate-900">{employee.user.email || '—'}</dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Status</dt><dd><span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${getLoginStatusClass(employee.user.status)}`}>{formatHrmStatus(employee.user.status)}</span></dd></div><div className="flex justify-between gap-3"><dt className="text-slate-500">Permission role</dt><dd className="font-medium text-slate-900">{employee.user.customRole?.name ?? 'No role assigned'}</dd></div></dl>{loginHint ? <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{loginHint}</p> : null}</> : <div className="mt-3"><p className="text-sm text-slate-500">No login account is linked to this employee.</p>{canLinkLogin ? <button type="button" onClick={() => setLinkLoginOpen(true)} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 hover:bg-slate-50"><Link2 className="h-3.5 w-3.5 text-amber-600" /> Link existing login</button> : null}</div>}</section><HrmAccessCard employeeId={employee.id} writable={writable} ownRecord={abilities.own} leftCompany={abilities.left} canManageEmployees={hasHrmPermission(user?.permissions, ['hrm.employees.manage'], isSuperAdmin)} refreshKey={accessRefresh} onLoaded={(access) => setLoginRole(access.login?.role ?? null)} />{abilities.documentsVisible ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="font-bold text-slate-950">KYC & bank</h2><button type="button" onClick={() => setSelectedTab('kyc')} className="text-xs font-semibold text-amber-700 hover:underline">Open KYC & Bank</button></div><div className="mt-3 grid grid-cols-3 gap-2">{[{ label: 'PAN', done: Boolean(getActiveKycDocument(employee.documents, 'PAN')) }, { label: 'Aadhaar', done: Boolean(getActiveKycDocument(employee.documents, 'AADHAAR')) }, { label: 'Bank', done: Boolean(employee.bankAccounts?.length) }].map((item) => <div key={item.label} className={`rounded-xl border px-3 py-2 text-center ${item.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}><p className="text-xs font-semibold text-slate-700">{item.label}</p><p className={`mt-0.5 text-[11px] font-semibold ${item.done ? 'text-emerald-700' : 'text-slate-400'}`}>{item.done ? (item.label === 'Bank' ? 'Added' : 'Verified') : 'Pending'}</p></div>)}</div></section> : null}<section id="hrm-assignments" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-2"><h2 className="font-bold text-slate-950">Assignments</h2>{canAddAssignment ? <button type="button" onClick={() => setAddAssignmentOpen(true)} className="inline-flex min-h-9 items-center rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 shadow-sm hover:bg-amber-500">Add assignment</button> : null}</div>{employee.assignments?.length ? <div className="mt-3 space-y-3">{employee.assignments.map((assignment) => <div key={assignment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><p className="font-semibold text-slate-800">{assignment.designation}</p><p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">{assignment.orgUnit?.name || 'Org unit pending'} · {formatHrmStatus(assignment.status)}{assignment.officeUnit?.name ? <> · {assignment.officeUnit.name}</> : null}{assignment.isOfficeManager ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{assignment.officeUnit?.type === 'REGION' ? 'State Manager' : 'Office manager'}</span> : null}</p>{[getAssignmentLocation(assignment), assignment.managerEmployee ? `Reports to ${assignment.managerEmployee.legalName}` : ''].filter(Boolean).length ? <p className="mt-1 text-xs text-slate-500">{[getAssignmentLocation(assignment), assignment.managerEmployee ? `Reports to ${assignment.managerEmployee.legalName}` : ''].filter(Boolean).join(' · ')}</p> : null}<p className="mt-1 text-xs text-slate-500">Effective {formatHrmDate(assignment.effectiveFrom)}</p></div>)}</div> : <p className="mt-3 text-sm text-slate-500">{canAddAssignment ? 'No employment assignment has been recorded yet. Add one to place this person in an office.' : 'No employment assignment has been recorded yet.'}</p>}</section>{canViewShift ? <HrmShiftCard employeeId={employee.id} portal={portal} canAssign={canAssignShift} assigning={shiftAssigning} onAssigningChange={setShiftAssigning} onChanged={() => load({ silent: true })} /> : null}
          {canReadSalary ? <HrmSalaryCard employeeId={employee.id} canPropose={canProposeSalary} canApprove={canApproveSalary} currentUserId={user?.id ?? null} isSuperAdmin={isSuperAdmin} proposing={salaryProposing} onProposingChange={setSalaryProposing} onChanged={() => load({ silent: true })} /> : null}
          {abilities.documentsVisible ? <HrmDocumentsCard employeeId={employee.id} employeeCode={employee.employeeCode} documents={employee.documents || []} canUpload={abilities.uploadDocuments} canView={canViewKycDocuments} canVerify={canVerifyDocuments} upload={documentUpload} onUploadChange={setDocumentUpload} onChanged={() => load({ silent: true })} /> : null}</div>
        </div> : null}

        {tab === 'kyc' && abilities.documentsVisible ? <HrmEmployeeKycPanel employeeId={employee.id} employeeName={employee.legalName} documents={employee.documents || []} bankAccounts={employee.bankAccounts || []} canManage={canManageKyc} canViewDocuments={canViewKycDocuments} currentUserId={user?.id ?? null} onChanged={() => load({ silent: true })} /> : null}

        {tab === 'attendance' ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Attendance</h2>{canMarkAttendance ? <form onSubmit={markAttendance} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4"><label className="text-xs font-semibold text-slate-700">Date<input required type="date" value={attendanceForm.attendanceDate} onChange={(event) => setAttendanceForm((current) => ({ ...current, attendanceDate: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><label className="text-xs font-semibold text-slate-700">Status<select value={attendanceForm.status} onChange={(event) => setAttendanceForm((current) => ({ ...current, status: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option>PRESENT</option><option>ABSENT</option><option>HALF_DAY</option><option>LEAVE</option><option>HOLIDAY</option><option>WEEK_OFF</option></select></label><label className="text-xs font-semibold text-slate-700 sm:col-span-2">Notes<input value={attendanceForm.notes} onChange={(event) => setAttendanceForm((current) => ({ ...current, notes: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><button type="submit" disabled={saving} className="min-h-9 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white sm:col-span-4">Save attendance</button></form> : null}<div className="mt-4 divide-y divide-slate-100">{denied.attendance ? noAccess : attendance.length ? attendance.map((record) => <div key={record.id} className="flex items-center justify-between py-3 text-sm"><span className="font-semibold text-slate-800">{formatHrmDate(record.attendanceDate)}</span><span className="text-slate-500">{formatHrmStatus(record.status)}{record.notes ? ` · ${record.notes}` : ''}</span></div>) : <p className="py-6 text-sm text-slate-500">No attendance records yet.</p>}</div></section> : null}

        {tab === 'leave' ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Leave requests</h2>{canSubmitLeave ? <form onSubmit={submitLeave} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4"><label className="text-xs font-semibold text-slate-700">Leave type ID<input required value={leaveForm.leaveTypeId} onChange={(event) => setLeaveForm((current) => ({ ...current, leaveTypeId: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><label className="text-xs font-semibold text-slate-700">Start<input required type="date" value={leaveForm.startDate} onChange={(event) => setLeaveForm((current) => ({ ...current, startDate: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><label className="text-xs font-semibold text-slate-700">End<input required type="date" value={leaveForm.endDate} onChange={(event) => setLeaveForm((current) => ({ ...current, endDate: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><label className="text-xs font-semibold text-slate-700">Units<input required type="number" min="0.5" step="0.5" value={leaveForm.units} onChange={(event) => setLeaveForm((current) => ({ ...current, units: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><label className="text-xs font-semibold text-slate-700 sm:col-span-3">Reason<input value={leaveForm.reason} onChange={(event) => setLeaveForm((current) => ({ ...current, reason: event.target.value }))} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs" /></label><button type="submit" disabled={saving} className="min-h-9 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white">Submit request</button></form> : null}<div className="mt-4 divide-y divide-slate-100">{denied.leave ? noAccess : leave.length ? leave.map((request) => <div key={request.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="font-semibold text-slate-800">{formatHrmDate(request.startDate)} – {formatHrmDate(request.endDate)}</span><span className="text-slate-500">{request.units} units · {formatHrmStatus(request.status)}</span></div>) : <p className="py-6 text-sm text-slate-500">No leave requests yet.</p>}</div></section> : null}

        {tab === 'compensation' ? (canReadSalary ? <HrmSalaryCard employeeId={employee.id} canPropose={canProposeSalary} canApprove={canApproveSalary} currentUserId={user?.id ?? null} isSuperAdmin={isSuperAdmin} proposing={salaryProposing} onProposingChange={setSalaryProposing} onChanged={() => load({ silent: true })} /> : <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Viewing salary needs one of the hrm.compensation.read, hrm.compensation.manage or hrm.compensation.approve permissions.</section>) : null}

        {tab === 'performance' ? <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Performance reviews</h2><div className="mt-3 space-y-3">{denied.performance ? noAccess : performance.length ? performance.map((review) => <div key={review.id} className="rounded-xl border border-slate-100 p-3"><p className="font-semibold text-slate-800">Cycle {review.cycleId}</p><p className="mt-1 text-xs text-slate-500">{formatHrmStatus(review.status)} · Rating {review.rating ?? '—'}</p></div>) : <p className="text-sm text-slate-500">No performance reviews yet.</p>}</div></section><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">Incentives</h2><div className="mt-3 space-y-3">{denied.incentives ? noAccess : incentives.length ? incentives.map((incentive) => <div key={incentive.id} className="rounded-xl border border-slate-100 p-3"><div className="flex justify-between"><p className="font-semibold text-slate-800">{incentive.incentiveType}</p><p className="font-semibold text-emerald-700">₹{incentive.amount.toLocaleString('en-IN')}</p></div><p className="mt-1 text-xs text-slate-500">{formatHrmDate(incentive.periodStart)} – {formatHrmDate(incentive.periodEnd)} · {formatHrmStatus(incentive.status)}</p></div>) : <p className="text-sm text-slate-500">No incentives yet.</p>}</div></section></div> : null}

        {tab === 'exit' ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-amber-600" /><h2 className="font-bold text-slate-950">Exit and full & final</h2></div><div className="mt-4 space-y-3">{denied.exit ? noAccess : exitCases.length ? exitCases.map((item) => <div key={item.id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-slate-800">{formatHrmStatus(item.exitType)}</p><span className="text-xs font-semibold text-slate-500">{formatHrmStatus(item.status)}</span></div><p className="mt-1 text-xs text-slate-500">Requested last day: {formatHrmDate(item.requestedLastDay)}</p>{item.reason ? <p className="mt-2 text-sm text-slate-600">{item.reason}</p> : null}</div>) : <p className="py-6 text-sm text-slate-500">No exit case has been initiated.</p>}</div></section> : null}
      </div>
      {resetPasswordOpen && employee.user ? (
        <HrmResetPasswordDialog
          employee={{ id: employee.id, employeeCode: employee.employeeCode, name: employee.preferredName || employee.legalName, loginEmail: employee.user.email }}
          ownLogin={employee.user.id === user?.id}
          onClose={() => setResetPasswordOpen(false)}
        />
      ) : null}
      {lifecycleDialog === 'transfer' ? (
        <TransferDialog
          employee={{ id: employee.id, employeeCode: employee.employeeCode, name: employee.preferredName || employee.legalName }}
          currentOfficeUnitId={employee.assignments?.find((assignment) => assignment.status === 'ACTIVE' && !assignment.effectiveTo)?.officeUnit?.id ?? null}
          onClose={() => setLifecycleDialog(null)}
          onDone={async (result) => { setLifecycleDialog(null); setNotice(describeMoveResult(result, {}, 'Transfer saved')); await load({ silent: true }); }}
        />
      ) : null}
      {lifecycleDialog === 'deactivate' ? (
        <DeactivateDialog
          employee={{ id: employee.id, employeeCode: employee.employeeCode, name: employee.preferredName || employee.legalName }}
          onClose={() => setLifecycleDialog(null)}
          onDone={async () => { setLifecycleDialog(null); await load({ silent: true }); }}
        />
      ) : null}
      {addAssignmentOpen ? (
        <HrmAddAssignmentDialog
          employee={{ id: employee.id, employeeCode: employee.employeeCode, name: employee.preferredName || employee.legalName }}
          onClose={() => setAddAssignmentOpen(false)}
          onDone={async () => { setAddAssignmentOpen(false); setNotice('Assignment added.'); await load({ silent: true }); }}
        />
      ) : null}
      {confirmJoiningOpen ? (
        <HrmConfirmJoiningDialog
          employeeId={employee.id}
          onClose={() => setConfirmJoiningOpen(false)}
          onDone={async (result) => { setConfirmJoiningOpen(false); setNotice(`${result.employeeCode} joined and is now active.`); setAccessRefresh((value) => value + 1); await load({ silent: true }); }}
        />
      ) : null}
      {linkLoginOpen ? (
        <HrmLinkLoginDialog
          employee={{ id: employee.id, employeeCode: employee.employeeCode, name: employee.preferredName || employee.legalName }}
          onClose={() => setLinkLoginOpen(false)}
          onLinked={async () => { setLinkLoginOpen(false); setNotice('Login linked to this employee.'); await load({ silent: true }); }}
        />
      ) : null}
    </main>
  );
}
