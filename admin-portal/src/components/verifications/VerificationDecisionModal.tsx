'use client';

import { useState } from 'react';
import axios from 'axios';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import type { VerificationDecisionStatus } from '@/lib/verificationReview';

type Props = {
  partnerId: string;
  partnerName: string;
  targetStatus: VerificationDecisionStatus;
  onClose: () => void;
  onDecided: (targetStatus: VerificationDecisionStatus) => void;
};

export default function VerificationDecisionModal({ partnerId, partnerName, targetStatus, onClose, onDecided }: Props) {
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.patch(`/superadmin/verifications/${partnerId}/status`, {
        status: targetStatus,
        comment: comment.trim() || undefined,
      });
      onDecided(targetStatus);
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error || 'Status update failed.' : 'Status update failed.');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-150 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-xl ${
              targetStatus === 'APPROVED'
                ? 'bg-emerald-100 text-emerald-700'
                : targetStatus === 'CHANGES_REQUESTED'
                ? 'bg-amber-100 text-amber-800'
                : 'bg-rose-100 text-rose-700'
            }`}
          >
            {targetStatus === 'APPROVED' ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : targetStatus === 'CHANGES_REQUESTED' ? (
              <AlertCircle className="h-5 w-5" />
            ) : (
              <XCircle className="h-5 w-5" />
            )}
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {targetStatus === 'APPROVED'
                ? 'Approve Partner & Activate Account'
                : targetStatus === 'CHANGES_REQUESTED'
                ? 'Request Corrections from Partner'
                : 'Reject KYC Application'}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium truncate max-w-xs">{partnerName}</p>
          </div>
        </div>

        <div className="space-y-3 text-xs">
          <p className="text-slate-600">
            {targetStatus === 'APPROVED'
              ? 'This will formally approve the partner dossier, grant access to post inventory, and activate partner privileges.'
              : targetStatus === 'CHANGES_REQUESTED'
              ? 'Enter specific notes for the partner explaining which documents or details require revision before approval.'
              : 'Are you sure you want to reject this onboarding dossier? This will set account status to REJECTED.'}
          </p>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Compliance / Audit Remark (Optional)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
              placeholder={
                targetStatus === 'CHANGES_REQUESTED'
                  ? 'e.g. Please re-upload a clear copy of Company PAN and GST certificate.'
                  : 'Audit or sign-off comment for the review log...'
              }
            />
          </div>

          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] font-semibold text-rose-700">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-200 px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={submitting}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-black shadow-2xs transition-all disabled:opacity-50 ${
              targetStatus === 'APPROVED'
                ? 'bg-[#FFC107] text-slate-950 hover:bg-[#E5AD06]'
                : targetStatus === 'CHANGES_REQUESTED'
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-rose-600 text-white hover:bg-rose-700'
            }`}
          >
            {submitting ? 'Processing...' : 'Confirm Decision'}
          </button>
        </div>
      </div>
    </div>
  );
}
