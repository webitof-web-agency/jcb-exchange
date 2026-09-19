"use client";

import React, { Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Home, Search, Tag, User, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/authStore';

function MobileBottomNavContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated, setAuthModalOpen } = useAuthStore();

  const currentTab = searchParams.get('tab');

  const navItems = [
    {
      name: t('nav.home', 'Home'),
      href: '/',
      icon: Home,
      requiresAuth: false,
    },
    {
      name: t('nav.search', 'Search'),
      href: '/machines',
      icon: Search,
      requiresAuth: false,
    },
    {
      name: t('nav.soldVehicles', 'Sold Vehicles'),
      href: '/sold-vehicles',
      icon: CheckCircle2,
      requiresAuth: true,
    },
    {
      name: t('nav.account', 'Account'),
      href: '/profile',
      icon: User,
      requiresAuth: true,
    },
  ];

  return (
    <div className="lg:hidden !fixed !bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-[9999] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          let isActive = false;
          if (item.href === '/') {
            isActive = pathname === '/';
          } else if (item.href.includes('?tab=')) {
            const itemPath = item.href.split('?')[0];
            const itemTab = item.href.split('?tab=')[1];
            isActive = pathname === itemPath && currentTab === itemTab;
          } else if (item.href === '/profile') {
            isActive = pathname === '/profile';
          } else {
            isActive = pathname?.startsWith(item.href);
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={(e) => {
                if (item.requiresAuth && !isAuthenticated) {
                  e.preventDefault();
                  setAuthModalOpen(true);
                }
              }}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-jcb-yellow' : 'text-gray-500 hover:text-gray-900'
                }`}
            >
              <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-jcb-yellow' : ''} />
              <span className="text-[10px] font-semibold">
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function MobileBottomNav() {
  return (
    <Suspense fallback={null}>
      <MobileBottomNavContent />
    </Suspense>
  );
}
