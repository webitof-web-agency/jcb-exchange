'use client';

import React from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import SiteBrand from '@/components/layout/SiteBrand';

export default function Footer() {
  const { t } = useTranslation();

  return (
    <footer className="bg-[#1A1A1A] text-gray-300 pt-16 pb-8 px-6 md:px-12 w-full mt-auto">
      <div className="max-w-[1200px] mx-auto">
        {/* Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 mb-12 md:mb-16 text-center md:text-left">
          
          {/* Brand Column */}
          <div className="col-span-1 flex flex-col items-center md:items-start">
            <div className="mb-4 md:mb-5 relative z-10">
              <SiteBrand variant="footer" />
            </div>
            <p className="text-sm md:text-[15px] text-[#B3B3B3] leading-relaxed mb-6 md:pr-4 max-w-sm md:max-w-md">
              {t('footer.description')}
            </p>
          </div>

          {/* Marketplace */}
          <div className="col-span-1 flex flex-col items-center md:items-end md:justify-end">
            <div>
              <h4 className="text-white text-[13px] font-bold tracking-[0.1em] uppercase mb-4 md:mb-6">{t('footer.marketplace')}</h4>
              <ul className="space-y-3 md:space-y-4 flex flex-col items-center md:items-start">
                <Link href="/machines" className="text-sm md:text-[15px] text-[#B3B3B3] hover:text-white transition-colors">{t('footer.browseInventory')}</Link>
                <Link href="#" className="text-sm md:text-[15px] text-[#B3B3B3] hover:text-white transition-colors">{t('footer.sellMachine')}</Link>
              </ul>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-[#4D4D4D] flex justify-center items-center">
          <p className="text-[13px] text-[#8C8C8C] text-center">
            &copy; 2025–2026 JCB Exchange | Crafted with ❤️ by <a href="https://webitof.com/" target="_blank" rel="noopener noreferrer" className="underline cursor-pointer hover:text-white transition-colors">Webitof</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
