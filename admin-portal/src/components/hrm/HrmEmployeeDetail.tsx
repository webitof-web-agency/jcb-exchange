'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { toast } from 'react-toastify';
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { hrmApi, type HrmAttendanceRecord, type HrmChecklistItem, type HrmEmployee, type HrmEmployeeOnboarding, type HrmExitCase, type HrmIncentive, type HrmLeaveRequest, type HrmPerformanceReview } from '@/lib/hrmApi';
import { formatHrmDate, getHrmErrorMessage, hasHrmPermission } from '@/lib/hrmUi';
import { getHrmProfileAbilities, getHrmProfileReads, isHrmForbidden, SELF_ACTION_HINT } from '@/lib/hrmAccess';
import { indiaDay } from '@/lib/hrmDay';
import { buildIdentityPatch, describeSaveNotice, detectIdentityChanges, mergeProfileForm, toProfileForm, validateIdentity, type ProfileForm } from '@/lib/hrmLogin';
import { describeReactivation } from '@/lib/hrmAssignment';
import { describeMoveResult } from '@/lib/hrmLifecycle';
import { CHECKLIST_TARGET, cleanText, describeStatusChangeRefusal, personNameProblem } from '@/lib/hrmProfile';
import { OPEN_CASE_STATUSES } from '@/lib/hrmStatus';
import { checklistAction, checklistTab, nextOpenItem, openItemsByTab, PROFILE_TABS, readProfileTab, visibleProfileTabs, type ProfileTab } from '@/lib/hrmProfileTabs';
import { documentGroupFor } from '@/lib/hrmDocuments';
import HrmEmployeeKycPanel from './HrmEmployeeKycPanel';
import HrmAddAssignmentDialog from './HrmAddAssignmentDialog';
import HrmLinkLoginDialog from './HrmLinkLoginDialog';
import HrmResetPasswordDialog from './HrmResetPasswordDialog';
import { DeactivateDialog, TransferDialog } from './HrmLifecycleDialogs';
import HrmJoiningChecklistCard from './HrmJoiningChecklistCard';
import HrmRecruitmentCard from './HrmRecruitmentCard';
import HrmPersonalDetailsCard from './HrmPersonalDetailsCard';
import HrmConfirmJoiningDialog from './HrmConfirmJoiningDialog';
import HrmChangeStatusDialog from './HrmChangeStatusDialog';
import HrmChangeManagerDialog from './HrmChangeManagerDialog';
import HrmAccessCard from './HrmAccessCard';
import HrmChargesCard from './HrmChargesCard';
import HrmSalaryCard from './HrmSalaryCard';
import HrmShiftCard from './HrmShiftCard';
import HrmDocumentsCard, { type DocumentUploadRequest } from './HrmDocumentsCard';
import HrmProfileHeader from './HrmProfileHeader';
import HrmProfileTabs, { HrmChecklistFocusBar } from './HrmProfileTabs';
import HrmProfileSummary from './HrmProfileSummary';
import HrmCoreDetailsCard, { type CoreDetailsErrors } from './HrmCoreDetailsCard';
import HrmLoginCard from './HrmLoginCard';
import HrmAssignmentsCard from './HrmAssignmentsCard';
import { HrmAttendancePanel, HrmExitPanel, HrmLeavePanel, HrmPerformancePanel, type AttendanceForm, type LeaveForm } from './HrmRecordPanels';

/** People who have not joined yet (or whose onboarding is still open) see the joining checklist first. */
const JOINING_STATUSES = new Set(['DRAFT', 'PRE_ONBOARDING', 'ONBOARDING']);

type HrmEmployeeDetailProps = { id: string; portal: 'admin' | 'employee' };
/** The open tab and, when it was opened from the joining checklist, the item being completed. */
type ProfileView = { tab: ProfileTab; focus: string | null };

const noSubscription = () => () => undefined;

export default function HrmEmployeeDetail({ id, portal }: HrmEmployeeDetailProps) {
  const { user } = useAuthStore();
  const [employee, setEmployee] = useState<HrmEmployee | null>(null);
  const [attendance, setAttendance] = useState<HrmAttendanceRecord[]>([]);
  const [leave, setLeave] = useState<HrmLeaveRequest[]>([]);
  const [performance, setPerformance] = useState<HrmPerformanceReview[]>([]);
  const [incentives, setIncentives] = useState<HrmIncentive[]>([]);
  const [exitCases, setExitCases] = useState<HrmExitCase[]>([]);
  const [chosenView, setChosenView] = useState<ProfileView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [linkLoginOpen, setLinkLoginOpen] = useState(false);
  const [confirmJoiningOpen, setConfirmJoiningOpen] = useState(false);
  const [accessRefresh, setAccessRefresh] = useState(0);
  // A transfer, exit or new assignment can end additional charges and move access: those cards load again.
  const [chargeRefresh, setChargeRefresh] = useState(0);
  const refreshRelated = () => { setChargeRefresh((value) => value + 1); setAccessRefresh((value) => value + 1); };
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<CoreDetailsErrors>({});
  const [lifecycleDialog, setLifecycleDialog] = useState<'transfer' | 'deactivate' | null>(null);
  const [addAssignmentOpen, setAddAssignmentOpen] = useState(false);
  const [changeManagerOpen, setChangeManagerOpen] = useState(false);
  const [edit, setEdit] = useState<ProfileForm>({ preferredName: '', workEmail: '', mobile: '', status: 'DRAFT', version: 1 });
  /** What the server last said the editable fields are: a reload only overwrites the fields still equal to it. */
  const serverFormRef = useRef<ProfileForm | null>(null);
  const [onboarding, setOnboarding] = useState<HrmEmployeeOnboarding | null>(null);
  const [personalEditing, setPersonalEditing] = useState(false);
  const [salaryProposing, setSalaryProposing] = useState(false);
  const [shiftAssigning, setShiftAssigning] = useState(false);
  const [documentUpload, setDocumentUpload] = useState<DocumentUploadRequest | null>(null);
  const [bankFormRequested, setBankFormRequested] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  /** Lists the viewer may not read (no permission, or the server answered 403). */
  const [denied, setDenied] = useState<Record<'attendance' | 'leave' | 'performance' | 'incentives' | 'exit', boolean>>({ attendance: false, leave: false, performance: false, incentives: false, exit: false });
  /** The linked login's account role, from the Access card (Reset password / login fields are for EMPLOYEE logins only). */
  const [loginRole, setLoginRole] = useState<string | null | undefined>(undefined);
  const [attendanceForm, setAttendanceForm] = useState<AttendanceForm>({ attendanceDate: indiaDay(), status: 'PRESENT', notes: '' });
  const [leaveForm, setLeaveForm] = useState<LeaveForm>({ leaveTypeId: '', startDate: '', endDate: '', units: '1', reason: '' });
  const tabsRef = useRef<HTMLDivElement | null>(null);
  /** The record shown on screen: reading it again keeps the page (no spinner, nothing typed is lost). */
  const loadedIdRef = useRef<string | null>(null);
  const requestRef = useRef(0);
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
  const canReadSalary = abilities.read.salary;
  const canViewShift = abilities.read.shift;
  const reads = useMemo(() => getHrmProfileReads(user), [user]);

  // The tab (and checklist item) comes from the link until the viewer picks one.
  const search = useSyncExternalStore(noSubscription, () => window.location.search, () => '');
  const linkView = useMemo<ProfileView>(() => {
    const params = new URLSearchParams(search);
    return { tab: readProfileTab(params.get('tab') ?? params.get('module')), focus: params.get('focus') };
  }, [search]);
  const requestedView = chosenView ?? linkView;
  const visibleTabs = visibleProfileTabs(employee?.status ?? 'DRAFT', abilities, {
    attendance: attendance.length > 0,
    leave: leave.length > 0,
    performance: performance.length > 0 || incentives.length > 0,
    exit: exitCases.length > 0,
  });
  // A tab the viewer may not see (for example ?tab=kyc without document access) opens the overview.
  const tab: ProfileTab = visibleTabs.find((item) => item.id === requestedView.tab)?.id ?? 'overview';

  // Reloading the page keeps the section that is open.
  useEffect(() => {
    if (!chosenView) return;
    const url = new URL(window.location.href);
    url.searchParams.delete('module');
    url.searchParams.set('tab', chosenView.tab);
    if (chosenView.focus) url.searchParams.set('focus', chosenView.focus);
    else url.searchParams.delete('focus');
    window.history.replaceState(null, '', url);
  }, [chosenView]);

  const load = useCallback(async (options: { silent?: boolean } = {}) => {
    const request = ++requestRef.current;
    const silent = Boolean(options.silent) || loadedIdRef.current === id;
    if (!silent) {
      setLoading(true); setError(''); setNotice(''); setEmployee(null); setOnboarding(null); setLoginRole(undefined); setFieldErrors({});
      setAttendance([]); setLeave([]); setPerformance([]); setIncentives([]); setExitCases([]);
      serverFormRef.current = null;
    }
    try {
      const base = await hrmApi.getEmployee(id);
      if (request !== requestRef.current) return;
      const nextEmployee = base.data.employee;
      setEmployee(nextEmployee);
      loadedIdRef.current = id;
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
      if (request !== requestRef.current) return;
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
      if (request !== requestRef.current) return;
      const message = getHrmErrorMessage(requestError, 'Unable to load this employee record.');
      // A refresh that fails after something was saved keeps the page as it is: the save worked, only the re-read did not.
      if (silent) toast.error(`${message} What is on screen may be out of date; reload the page to see the latest.`);
      else setError(message);
    } finally {
      if (request === requestRef.current) setLoading(false);
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
    const identityLocked = hasLogin && !abilities.editLoginIdentity;
    const baseline = { workEmail: employee.workEmail, mobile: employee.mobile };
    const typed = { workEmail: edit.workEmail, mobile: edit.mobile };
    const preferredChanged = cleanText(edit.preferredName) !== cleanText(employee.preferredName || '');
    const preferredProblem = preferredChanged ? personNameProblem(edit.preferredName) : null;
    const problems: CoreDetailsErrors = {
      ...(identityLocked ? {} : validateIdentity(typed, baseline, hasLogin)),
      ...(preferredProblem ? { preferredName: preferredProblem } : {}),
    };
    setFieldErrors(problems);
    if (Object.keys(problems).length) { setError('Please correct the highlighted fields. Nothing was saved.'); return; }
    const changes = identityLocked ? { email: false, mobile: false } : detectIdentityChanges(typed, baseline);
    // The status is changed with "Change status", never by this form.
    const patch = {
      ...(preferredChanged ? { preferredName: cleanText(edit.preferredName) || null } : {}),
      ...(identityLocked ? {} : buildIdentityPatch(typed, baseline, hasLogin)),
    };
    if (!Object.keys(patch).length) { setNotice('Nothing has changed.'); return; }
    setSaving(true);
    try {
      const response = await hrmApi.updateEmployee(id, { ...patch, version: edit.version });
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

  /** Whether the viewer can complete this checklist item themselves. */
  const canCompleteChecklistItem = (item: HrmChecklistItem) => {
    const target = CHECKLIST_TARGET[item.key];
    if (!target || !writable) return false;
    if (target.card === 'personal') return abilities.editPersonal;
    if (target.card === 'assignment') return abilities.addAssignment;
    if (target.card === 'kyc') return abilities.tabs.kyc && abilities.manageKyc;
    if (target.card === 'documents') return abilities.documentsVisible && abilities.uploadDocuments;
    if (target.card === 'salary') return canReadSalary && abilities.proposeSalary;
    if (target.card === 'shift') return canViewShift && abilities.assignShift;
    return false;
  };
  const canOpenTab = (target: ProfileTab) => visibleTabs.some((item) => item.id === target);
  const actionFor = (item: HrmChecklistItem) => {
    const target = checklistTab(item.key);
    return checklistAction(item, { open: Boolean(target && canOpenTab(target)), complete: canCompleteChecklistItem(item) });
  };

  const closeForms = () => {
    setPersonalEditing(false); setSalaryProposing(false); setShiftAssigning(false); setDocumentUpload(null); setBankFormRequested(false);
  };
  const showView = (view: ProfileView) => {
    setChosenView(view);
    window.requestAnimationFrame(() => tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const selectTab = (next: ProfileTab) => { closeForms(); showView({ tab: next, focus: null }); };

  /** Opens exactly the part where a checklist item is done; "Complete" also opens its form. */
  const openChecklistItem = (item: HrmChecklistItem, action: 'Complete' | 'Review' | 'View') => {
    const target = CHECKLIST_TARGET[item.key];
    const targetTab = checklistTab(item.key);
    if (!target || !targetTab) return;
    closeForms();
    showView({ tab: targetTab, focus: item.key });
    if (action !== 'Complete' || !canCompleteChecklistItem(item)) return;
    if (target.card === 'personal') setPersonalEditing(true);
    else if (target.card === 'assignment') setAddAssignmentOpen(true);
    else if (target.card === 'documents') setDocumentUpload({ category: target.category ?? null });
    else if (target.card === 'salary') setSalaryProposing(true);
    else if (target.card === 'shift') setShiftAssigning(true);
    else if (item.key === 'BANK') setBankFormRequested(true);
  };

  const markAttendance = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try { await hrmApi.upsertAttendance(id, attendanceForm); setNotice('Attendance saved.'); await load({ silent: true }); }
    catch (requestError) { setError(getHrmErrorMessage(requestError, 'Unable to save attendance.')); }
    finally { setSaving(false); }
  };

  const submitLeave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    try { await hrmApi.createLeave(id, { ...leaveForm, units: Number(leaveForm.units), idempotencyKey: `portal-${id}-${leaveForm.startDate}-${Date.now()}` }); setLeaveForm({ leaveTypeId: '', startDate: '', endDate: '', units: '1', reason: '' }); setNotice('Leave request submitted.'); await load({ silent: true }); }
    catch (requestError) { setError(getHrmErrorMessage(requestError, 'Unable to submit leave request.')); }
    finally { setSaving(false); }
  };

  if (loading) return <main className="flex min-h-[40vh] w-full items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-amber-500" aria-label="Loading employee" /></main>;
  if (!employee) return <main className="w-full"><div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{error || 'Employee not found.'}</div></main>;

  const onboardingHref = `/${portal}/hrm/onboarding`;
  const showChecklist = Boolean(onboarding) && (JOINING_STATUSES.has(employee.status) || OPEN_CASE_STATUSES.has(onboarding?.case?.status ?? ''));
  const focusItem = showChecklist && requestedView.focus && checklistTab(requestedView.focus) === tab
    ? onboarding!.checklist.find((item) => item.key === requestedView.focus) ?? null
    : null;
  const focus = focusItem?.key ?? null;
  const nextItem = focusItem ? nextOpenItem(onboarding!.checklist, focusItem.key, canCompleteChecklistItem) : null;
  const tabLabel = PROFILE_TABS.find((item) => item.id === tab)?.label ?? '';
  // Every status change needs hrm.employees.manage; the dialog says what else a particular change needs.
  const openStatus = hasHrmPermission(user?.permissions, ['hrm.employees.manage'], isSuperAdmin) ? () => setStatusOpen(true) : undefined;
  const kycFocus = focus === 'PAN' || focus === 'AADHAAR' || focus === 'BANK' ? focus : null;
  const dialogEmployee = { id: employee.id, employeeCode: employee.employeeCode, name: employee.preferredName || employee.legalName };

  return (
    <main className="w-full space-y-4">
      <Link href={`/${portal}/hrm`} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-amber-700"><ArrowLeft className="h-4 w-4" /> Back to HRM</Link>
      <HrmProfileHeader
        employee={employee}
        onboardingHref={onboardingHref}
        saving={saving}
        onConfirmJoining={abilities.confirmJoining ? () => setConfirmJoiningOpen(true) : undefined}
        onTransfer={abilities.transfer ? () => setLifecycleDialog('transfer') : undefined}
        onDeactivate={abilities.deactivate ? () => setLifecycleDialog('deactivate') : undefined}
        showCancelJoining={abilities.useCancelJoining}
        onReactivate={employee.status === 'SUSPENDED' && abilities.reactivate ? () => void reactivate() : undefined}
        onChangeStatus={openStatus}
      />
      {employee.archivedAt ? <div role="status" className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> <span><strong>Archived</strong> — this person never joined (record kept for history, archived on {formatHrmDate(employee.archivedAt)}). Nothing on it can be changed.</span></div> : null}
      {abilities.own && writable ? <div role="note" className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> <span><strong>Your own HR record.</strong> Approvals, verification, access, joining, attendance, salary, KYC &amp; bank, shift, transfer and assignments on it are {SELF_ACTION_HINT.toLowerCase()}. You can still update your personal details, request leave and upload documents.</span></div> : null}
      {abilities.left && writable ? <div role="note" className="flex items-start gap-3 rounded-xl border border-slate-300 bg-slate-100 px-4 py-3 text-sm text-slate-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" /> <span><strong>Has left the company.</strong> Attendance, leave requests, salary, KYC &amp; bank, shift, performance and incentives can no longer be changed. Documents (upload and verification), leave decisions and the exit case still can.</span></div> : null}
      {error ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div> : null}
      {notice ? <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {notice}</div> : null}

      <div ref={tabsRef} className="scroll-mt-3">
        <HrmProfileTabs tabs={visibleTabs} active={tab} openCounts={showChecklist ? openItemsByTab(onboarding!.checklist) : {}} onSelect={selectTab} />
      </div>
      {focusItem ? (
        <HrmChecklistFocusBar
          item={focusItem}
          next={nextItem}
          sectionLabel={tabLabel}
          onBack={() => selectTab('overview')}
          onNext={(item) => openChecklistItem(item, 'Complete')}
          onShowAll={() => selectTab(tab)}
        />
      ) : null}

      {tab === 'overview' ? (
        <div className="space-y-4">
          {showChecklist ? <HrmJoiningChecklistCard onboarding={onboarding!} portal={portal} actionFor={actionFor} onOpen={openChecklistItem} canOpenOnboarding={abilities.openOnboarding} /> : null}
          <HrmProfileSummary employee={employee} onboarding={onboarding} canOpen={canOpenTab} onOpen={selectTab} onChangeManager={abilities.changeManager ? () => setChangeManagerOpen(true) : undefined} />
        </div>
      ) : null}

      {tab === 'personal' ? (
        <div className="space-y-4">
          {focus ? null : (
            <HrmCoreDetailsCard
              employee={employee}
              form={edit}
              onChange={(key, value) => { setEdit((current) => ({ ...current, [key]: value })); setFieldErrors((current) => ({ ...current, [key]: undefined })); }}
              errors={fieldErrors}
              onSubmit={saveEmployee}
              saving={saving}
              canEdit={abilities.editProfile}
              canEditLoginIdentity={abilities.editLoginIdentity}
              loginRole={loginRole ?? employee.user?.role}
              ownRecord={abilities.own}
              offerReference={onboarding?.recruitment?.letterNo ?? null}
              onChangeStatus={openStatus}
            />
          )}
          <HrmPersonalDetailsCard
            employee={employee}
            canEdit={abilities.editPersonal}
            lockDateOfBirth={abilities.lockDateOfBirth}
            editing={personalEditing}
            onEditingChange={setPersonalEditing}
            onSaved={(next) => { setEmployee(next); const fresh = toProfileForm(next); serverFormRef.current = fresh; setEdit((current) => ({ ...current, version: fresh.version })); void load({ silent: true }); }}
            onConflict={() => load({ silent: true })}
          />
        </div>
      ) : null}

      {tab === 'job' ? (
        <div className="space-y-4">
          <HrmAssignmentsCard assignments={employee.assignments ?? []} onAdd={abilities.addAssignment ? () => setAddAssignmentOpen(true) : undefined} onChangeManager={abilities.changeManager ? () => setChangeManagerOpen(true) : undefined} />
          {focus ? null : (
            <>
              <HrmChargesCard subject={{ kind: 'employee', id: employee.id, name: employee.preferredName || employee.legalName, employeeCode: employee.employeeCode }} portal={portal} canGive={abilities.giveCharge} refreshKey={chargeRefresh} onChanged={() => { setAccessRefresh((value) => value + 1); void load({ silent: true }); }} />
              {onboarding?.recruitment ? <HrmRecruitmentCard recruitment={onboarding.recruitment} /> : null}
            </>
          )}
        </div>
      ) : null}

      {tab === 'kyc' && abilities.documentsVisible ? <HrmEmployeeKycPanel key={`${kycFocus ?? 'all'}-${bankFormRequested}`} employeeId={employee.id} employeeName={employee.legalName} documents={employee.documents || []} bankAccounts={employee.bankAccounts || []} canManage={abilities.manageKyc} canViewDocuments={abilities.read.documentFiles} currentUserId={user?.id ?? null} onChanged={() => load({ silent: true })} only={kycFocus} openBankForm={bankFormRequested} /> : null}

      {tab === 'documents' && abilities.documentsVisible ? <HrmDocumentsCard employeeId={employee.id} employeeCode={employee.employeeCode} employeeUserId={employee.user?.id ?? null} documents={employee.documents || []} canUpload={abilities.uploadDocuments} canView={abilities.read.documentFiles} canVerify={abilities.verifyDocuments} focus={documentGroupFor(focus)} upload={documentUpload} onUploadChange={setDocumentUpload} onChanged={() => load({ silent: true })} /> : null}

      {tab === 'salary' ? (canReadSalary ? <HrmSalaryCard employeeId={employee.id} canPropose={abilities.proposeSalary} canApprove={abilities.approveSalary} currentUserId={user?.id ?? null} isSuperAdmin={isSuperAdmin} proposing={salaryProposing} onProposingChange={setSalaryProposing} onChanged={() => load({ silent: true })} /> : <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Viewing salary needs one of the hrm.compensation.read, hrm.compensation.manage or hrm.compensation.approve permissions.</section>) : null}

      {tab === 'shift' && canViewShift ? <HrmShiftCard employeeId={employee.id} portal={portal} canAssign={abilities.assignShift} assigning={shiftAssigning} onAssigningChange={setShiftAssigning} onChanged={() => load({ silent: true })} /> : null}

      {tab === 'attendance' ? <HrmAttendancePanel records={attendance} denied={denied.attendance} canMark={abilities.markAttendance} form={attendanceForm} onChange={(next) => setAttendanceForm((current) => ({ ...current, ...next }))} onSubmit={markAttendance} saving={saving} /> : null}
      {tab === 'leave' ? <HrmLeavePanel requests={leave} denied={denied.leave} canSubmit={abilities.submitLeave} form={leaveForm} onChange={(next) => setLeaveForm((current) => ({ ...current, ...next }))} onSubmit={submitLeave} saving={saving} /> : null}
      {tab === 'performance' ? <HrmPerformancePanel reviews={performance} incentives={incentives} deniedReviews={denied.performance} deniedIncentives={denied.incentives} /> : null}
      {tab === 'exit' ? <HrmExitPanel cases={exitCases} denied={denied.exit} /> : null}

      {tab === 'access' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <HrmLoginCard employee={employee} onResetPassword={abilities.resetPassword ? () => setResetPasswordOpen(true) : undefined} onLinkLogin={abilities.linkLogin ? () => setLinkLoginOpen(true) : undefined} />
          <HrmAccessCard employeeId={employee.id} writable={writable} ownRecord={abilities.own} leftCompany={abilities.left} canManageEmployees={hasHrmPermission(user?.permissions, ['hrm.employees.manage'], isSuperAdmin)} refreshKey={accessRefresh} onLoaded={(access) => setLoginRole(access.login?.role ?? null)} />
        </div>
      ) : null}

      {statusOpen ? (
        <HrmChangeStatusDialog
          employeeId={employee.id}
          onClose={() => setStatusOpen(false)}
          onChanged={async (message) => { setError(''); setNotice(message ?? ''); refreshRelated(); await load({ silent: true }); }}
        />
      ) : null}
      {resetPasswordOpen && employee.user ? (
        <HrmResetPasswordDialog
          employee={{ ...dialogEmployee, loginEmail: employee.user.email }}
          ownLogin={employee.user.id === user?.id}
          onClose={() => setResetPasswordOpen(false)}
        />
      ) : null}
      {lifecycleDialog === 'transfer' ? (
        <TransferDialog
          employee={dialogEmployee}
          currentOfficeUnitId={employee.assignments?.find((assignment) => assignment.status === 'ACTIVE' && !assignment.effectiveTo)?.officeUnit?.id ?? null}
          onClose={() => setLifecycleDialog(null)}
          onDone={async (result) => { setLifecycleDialog(null); setNotice(describeMoveResult(result, {}, 'Transfer saved')); refreshRelated(); await load({ silent: true }); }}
        />
      ) : null}
      {lifecycleDialog === 'deactivate' ? (
        <DeactivateDialog
          employee={dialogEmployee}
          onClose={() => setLifecycleDialog(null)}
          onDone={async () => { setLifecycleDialog(null); refreshRelated(); await load({ silent: true }); }}
        />
      ) : null}
      {changeManagerOpen ? (
        <HrmChangeManagerDialog
          employee={dialogEmployee}
          assignments={employee.assignments ?? []}
          onClose={() => setChangeManagerOpen(false)}
          onDone={async (message) => { setChangeManagerOpen(false); setError(''); setNotice(message); refreshRelated(); await load({ silent: true }); }}
        />
      ) : null}
      {addAssignmentOpen ? (
        <HrmAddAssignmentDialog
          employee={dialogEmployee}
          onClose={() => setAddAssignmentOpen(false)}
          onDone={async () => { setAddAssignmentOpen(false); setNotice('Assignment added.'); refreshRelated(); await load({ silent: true }); }}
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
          employee={dialogEmployee}
          onClose={() => setLinkLoginOpen(false)}
          onLinked={async () => { setLinkLoginOpen(false); setNotice('Login linked to this employee.'); refreshRelated(); await load({ silent: true }); }}
        />
      ) : null}
    </main>
  );
}
