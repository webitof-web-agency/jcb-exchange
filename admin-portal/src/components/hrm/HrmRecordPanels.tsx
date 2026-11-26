'use client';

import { CalendarDays } from 'lucide-react';
import type { HrmAttendanceRecord, HrmExitCase, HrmIncentive, HrmLeaveRequest, HrmPerformanceReview } from '@/lib/hrmApi';
import { formatHrmDate, formatHrmStatus } from '@/lib/hrmUi';
import { HRM_NO_ACCESS_MESSAGE } from '@/lib/hrmAccess';

/** The attendance, leave, performance and exit tabs of the employee profile. */

const card = 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const field = 'mt-1 min-h-9 w-full rounded-lg border border-slate-200 px-2 text-xs';
const noAccess = <p className="py-6 text-sm text-slate-500">{HRM_NO_ACCESS_MESSAGE}</p>;

export type AttendanceForm = { attendanceDate: string; status: string; notes: string };
export type LeaveForm = { leaveTypeId: string; startDate: string; endDate: string; units: string; reason: string };

export function HrmAttendancePanel({ records, denied, canMark, form, onChange, onSubmit, saving }: {
  records: HrmAttendanceRecord[];
  denied: boolean;
  canMark: boolean;
  form: AttendanceForm;
  onChange: (next: Partial<AttendanceForm>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  return (
    <section className={card}>
      <h2 className="font-bold text-slate-950">Attendance</h2>
      {canMark ? (
        <form onSubmit={onSubmit} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
          <label className="text-xs font-semibold text-slate-700">Date<input required type="date" value={form.attendanceDate} onChange={(event) => onChange({ attendanceDate: event.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-700">Status<select value={form.status} onChange={(event) => onChange({ status: event.target.value })} className={`${field} bg-white`}><option>PRESENT</option><option>ABSENT</option><option>HALF_DAY</option><option>LEAVE</option><option>HOLIDAY</option><option>WEEK_OFF</option></select></label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Notes<input value={form.notes} maxLength={5000} onChange={(event) => onChange({ notes: event.target.value })} className={field} /></label>
          <button type="submit" disabled={saving} className="min-h-9 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white disabled:opacity-60 sm:col-span-4">Save attendance</button>
        </form>
      ) : null}
      <div className="mt-4 divide-y divide-slate-100">
        {denied ? noAccess : records.length ? records.map((record) => (
          <div key={record.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span className="font-semibold text-slate-800">{formatHrmDate(record.attendanceDate)}</span><span className="text-slate-500">{formatHrmStatus(record.status)}{record.notes ? ` · ${record.notes}` : ''}</span></div>
        )) : <p className="py-6 text-sm text-slate-500">No attendance records yet.</p>}
      </div>
    </section>
  );
}

export function HrmLeavePanel({ requests, denied, canSubmit, form, onChange, onSubmit, saving }: {
  requests: HrmLeaveRequest[];
  denied: boolean;
  canSubmit: boolean;
  form: LeaveForm;
  onChange: (next: Partial<LeaveForm>) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  saving: boolean;
}) {
  return (
    <section className={card}>
      <h2 className="font-bold text-slate-950">Leave requests</h2>
      {canSubmit ? (
        <form onSubmit={onSubmit} className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-4">
          <label className="text-xs font-semibold text-slate-700">Leave type ID<input required value={form.leaveTypeId} onChange={(event) => onChange({ leaveTypeId: event.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-700">Start<input required type="date" value={form.startDate} onChange={(event) => onChange({ startDate: event.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-700">End<input required type="date" value={form.endDate} min={form.startDate || undefined} onChange={(event) => onChange({ endDate: event.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-700">Units<input required type="number" min="0.5" step="0.5" value={form.units} onChange={(event) => onChange({ units: event.target.value })} className={field} /></label>
          <label className="text-xs font-semibold text-slate-700 sm:col-span-3">Reason<input value={form.reason} maxLength={5000} onChange={(event) => onChange({ reason: event.target.value })} className={field} /></label>
          <button type="submit" disabled={saving} className="min-h-9 self-end rounded-lg bg-slate-950 px-3 text-xs font-bold text-white disabled:opacity-60">Submit request</button>
        </form>
      ) : null}
      <div className="mt-4 divide-y divide-slate-100">
        {denied ? noAccess : requests.length ? requests.map((request) => (
          <div key={request.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"><span className="font-semibold text-slate-800">{formatHrmDate(request.startDate)} – {formatHrmDate(request.endDate)}</span><span className="text-slate-500">{request.units} units · {formatHrmStatus(request.status)}</span></div>
        )) : <p className="py-6 text-sm text-slate-500">No leave requests yet.</p>}
      </div>
    </section>
  );
}

export function HrmPerformancePanel({ reviews, incentives, deniedReviews, deniedIncentives }: {
  reviews: HrmPerformanceReview[];
  incentives: HrmIncentive[];
  deniedReviews: boolean;
  deniedIncentives: boolean;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className={card}>
        <h2 className="font-bold text-slate-950">Performance reviews</h2>
        <div className="mt-3 space-y-3">
          {deniedReviews ? noAccess : reviews.length ? reviews.map((review) => (
            <div key={review.id} className="rounded-xl border border-slate-100 p-3"><p className="font-semibold text-slate-800">Cycle {review.cycleId}</p><p className="mt-1 text-xs text-slate-500">{formatHrmStatus(review.status)} · Rating {review.rating ?? '—'}</p></div>
          )) : <p className="text-sm text-slate-500">No performance reviews yet.</p>}
        </div>
      </section>
      <section className={card}>
        <h2 className="font-bold text-slate-950">Incentives</h2>
        <div className="mt-3 space-y-3">
          {deniedIncentives ? noAccess : incentives.length ? incentives.map((incentive) => (
            <div key={incentive.id} className="rounded-xl border border-slate-100 p-3"><div className="flex justify-between gap-3"><p className="font-semibold text-slate-800">{incentive.incentiveType}</p><p className="font-semibold text-emerald-700">₹{incentive.amount.toLocaleString('en-IN')}</p></div><p className="mt-1 text-xs text-slate-500">{formatHrmDate(incentive.periodStart)} – {formatHrmDate(incentive.periodEnd)} · {formatHrmStatus(incentive.status)}</p></div>
          )) : <p className="text-sm text-slate-500">No incentives yet.</p>}
        </div>
      </section>
    </div>
  );
}

export function HrmExitPanel({ cases, denied }: { cases: HrmExitCase[]; denied: boolean }) {
  return (
    <section className={card}>
      <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-amber-600" aria-hidden="true" /><h2 className="font-bold text-slate-950">Exit and full & final</h2></div>
      <div className="mt-4 space-y-3">
        {denied ? noAccess : cases.length ? cases.map((item) => (
          <div key={item.id} className="rounded-xl border border-slate-100 p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-slate-800">{formatHrmStatus(item.exitType)}</p><span className="text-xs font-semibold text-slate-500">{formatHrmStatus(item.status)}</span></div><p className="mt-1 text-xs text-slate-500">Requested last day: {formatHrmDate(item.requestedLastDay)}</p>{item.reason ? <p className="mt-2 text-sm text-slate-600">{item.reason}</p> : null}</div>
        )) : <p className="py-6 text-sm text-slate-500">No exit case has been initiated.</p>}
      </div>
    </section>
  );
}
