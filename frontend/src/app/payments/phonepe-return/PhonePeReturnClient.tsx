"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import { CheckCircle2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || fallbackMessage;
  }

  return error instanceof Error ? error.message : fallbackMessage;
};

type VerificationState = 'loading' | 'paid' | 'pending' | 'failed' | 'error';

export default function PhonePeReturnClient() {
  const searchParams = useSearchParams();
  const listingId = searchParams.get('listingId') || '';
  const merchantOrderId = searchParams.get('merchantOrderId') || '';
  const [state, setState] = useState<VerificationState>('loading');
  const [message, setMessage] = useState('Checking PhonePe payment status...');

  useEffect(() => {
    let mounted = true;

    const verifyPayment = async () => {
      if (!listingId || !merchantOrderId) {
        setState('error');
        setMessage('Payment return details are missing.');
        return;
      }

      try {
        const response = await api.post<{
          message: string;
          payment: { status: string };
        }>(`/listings/${listingId}/phonepe-status`, {
          merchantOrderId,
        });

        if (!mounted) {
          return;
        }

        const paymentStatus = response.data.payment.status;
        setMessage(response.data.message);
        setState(paymentStatus === 'PAID' ? 'paid' : paymentStatus === 'FAILED' ? 'failed' : 'pending');
      } catch (error) {
        if (!mounted) {
          return;
        }

        setState('error');
        setMessage(getApiErrorMessage(error, 'Unable to verify PhonePe payment.'));
      }
    };

    void verifyPayment();

    return () => {
      mounted = false;
    };
  }, [listingId, merchantOrderId]);

  const isSuccess = state === 'paid';
  const isLoading = state === 'loading';

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gray-100">
          {isLoading ? (
            <BrandLoader size="xs" variant="inline" bg="light" />
          ) : isSuccess ? (
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          ) : (
            <XCircle className="h-7 w-7 text-red-600" />
          )}
        </div>
        <h1 className="mt-4 text-xl font-black text-gray-900">
          {isLoading ? 'Verifying Payment' : isSuccess ? 'Payment Captured' : 'Payment Update'}
        </h1>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {listingId ? (
            <Link
              href={`/machines/${listingId}`}
              className="flex-1 rounded-lg bg-[#FFC107] px-4 py-3 text-sm font-bold text-black transition hover:bg-[#e5ad06]"
            >
              Back to Listing
            </Link>
          ) : null}
          <Link
            href="/profile"
            className="flex-1 rounded-lg border border-gray-200 px-4 py-3 text-sm font-bold text-gray-700 transition hover:bg-gray-50"
          >
            View Profile
          </Link>
        </div>
      </section>
    </main>
  );
}
