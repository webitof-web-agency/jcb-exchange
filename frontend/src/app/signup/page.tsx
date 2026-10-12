"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function SignupPage() {
  const router = useRouter();
  const { isAuthenticated, setAuthModalOpen } = useAuthStore();

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/');
    } else {
      setAuthModalOpen(true, 'signup');
    }
  }, [isAuthenticated, router, setAuthModalOpen]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50 p-4">
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-500">Opening sign up page...</p>
      </div>
    </div>
  );
}
