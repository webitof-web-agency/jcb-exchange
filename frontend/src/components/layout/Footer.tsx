'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from '@/hooks/useTranslation';
import SiteBrand from '@/components/layout/SiteBrand';
import SellVehicleModal from '@/components/sell/SellVehicleModal';
import CustomerPrimePaymentModal from '@/components/payments/CustomerPrimePaymentModal';
import { useAuthStore } from '@/store/authStore';
import api from '@/lib/api';
import { 
  ChevronRight, 
  Globe,
  Phone, 
  Mail, 
  MapPin 
} from 'lucide-react';

type FooterSocialLink = {
  id: string;
  platform: string;
  url: string;
  displayOrder: number;
};

type FooterContact = {
  phoneNumber?: string | null;
  phoneLabel?: string | null;
  emailAddress?: string | null;
  emailLabel?: string | null;
  address?: string | null;
};

type ResolvedFooterContact = {
  phoneNumber: string;
  phoneLabel: string;
  emailAddress: string;
  emailLabel: string;
  address: string;
};

type FooterSettingsResponse = {
  success: boolean;
  data?: {
    socialLinks?: FooterSocialLink[];
    contact?: FooterContact;
  };
};

const emptyContact: ResolvedFooterContact = {
  phoneNumber: '',
  phoneLabel: '',
  emailAddress: '',
  emailLabel: '',
  address: '',
};

const platformLabelMap: Record<string, string> = {
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  TWITTER: 'X',
  LINKEDIN: 'LinkedIn',
  YOUTUBE: 'YouTube',
  WHATSAPP: 'WhatsApp',
  CUSTOM: 'Website',
};

const normalizeExternalUrl = (value?: string | null) => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  const candidateValue = /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;

  try {
    const parsedUrl = new URL(candidateValue);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
};

const SocialIcon = ({ platform }: { platform: string }) => {
  switch (platform) {
    case 'FACEBOOK':
      return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>;
    case 'INSTAGRAM':
      return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></svg>;
    case 'TWITTER':
      return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l11.733 16H20L8.267 4z" /><path d="M4 20l6.768-6.768" /><path d="M13.227 10.773L20 4" /></svg>;
    case 'LINKEDIN':
      return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></svg>;
    case 'YOUTUBE':
      return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.56 49.56 0 0 1-16.2 0A2 2 0 0 1 2.5 17" /><path d="m10 15 5-3-5-3z" /></svg>;
    case 'WHATSAPP':
      return <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.72 13.06c-.29-.15-1.7-.84-1.96-.94-.26-.1-.45-.15-.64.15-.19.29-.74.94-.91 1.13-.17.19-.34.22-.63.08-.29-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.63-2.03-.17-.29-.02-.45.13-.6.13-.13.29-.34.43-.51.15-.17.19-.29.29-.49.1-.19.05-.37-.02-.51-.08-.15-.64-1.54-.87-2.11-.23-.55-.46-.48-.64-.49h-.54c-.19 0-.49.08-.74.37s-.98.96-.98 2.34 1 2.72 1.14 2.91c.15.19 1.97 3 4.88 4.08.69.3 1.23.48 1.65.61.69.22 1.31.19 1.8.11.55-.08 1.7-.69 1.94-1.36.24-.67.24-1.25.17-1.36-.07-.11-.26-.18-.55-.33" /><path d="M20.52 3.48A11.86 11.86 0 0 0 12.09 0C5.55 0 .23 5.32.23 11.86c0 2.09.55 4.13 1.6 5.93L0 24l6.39-1.68a11.83 11.83 0 0 0 5.7 1.45h.01c6.54 0 11.86-5.32 11.86-11.86 0-3.17-1.23-6.15-3.44-8.43" /></svg>;
    default:
      return <Globe size={16} />;
  }
};

export default function Footer() {
  const { t } = useTranslation();
  const { setAuthModalOpen, isAuthenticated, user } = useAuthStore();
  
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [isPrimePaymentOpen, setIsPrimePaymentOpen] = useState(false);
  const [socialLinks, setSocialLinks] = useState<FooterSocialLink[]>([]);
  const [contact, setContact] = useState<ResolvedFooterContact>(emptyContact);
  const visibleSocialLinks = [...socialLinks]
    .filter((item) => ['FACEBOOK', 'INSTAGRAM', 'TWITTER'].includes(String(item.platform || '').toUpperCase()))
    .sort((left, right) => left.displayOrder - right.displayOrder);

  useEffect(() => {
    let cancelled = false;

    const fetchFooterSettings = async () => {
      try {
        const response = await api.get<FooterSettingsResponse>('/master/footer');
        if (cancelled) {
          return;
        }

        const nextSocialLinks = (response.data.data?.socialLinks || [])
          .map((item) => ({
            ...item,
            platform: (item.platform || 'CUSTOM').toUpperCase(),
            url: normalizeExternalUrl(item.url) || '',
          }))
          .filter((item) => item.url);

        setSocialLinks(nextSocialLinks);
        setContact({
          phoneNumber: (response.data.data?.contact?.phoneNumber || '').trim(),
          phoneLabel: (response.data.data?.contact?.phoneLabel || '').trim(),
          emailAddress: (response.data.data?.contact?.emailAddress || '').trim(),
          emailLabel: (response.data.data?.contact?.emailLabel || '').trim(),
          address: (response.data.data?.contact?.address || '').trim(),
        });
      } catch {
        if (!cancelled) {
          setSocialLinks([]);
          setContact(emptyContact);
        }
      }
    };

    void fetchFooterSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenSellVehicle = () => {
    if (!isAuthenticated) {
      setAuthModalOpen(true);
      return;
    }

    if (user?.role === 'CUSTOMER' && !user?.isPrimeCustomer) {
      setIsPrimePaymentOpen(true);
      return;
    }

    setIsSellModalOpen(true);
  };

  return (
    <>
      <footer className="bg-[#1A1A1A] text-gray-300 pt-16 pb-6 px-6 md:px-12 w-full mt-auto border-t-[10px] border-[#E6E6E6]">
        <div className="max-w-[1200px] mx-auto">
          {/* Top Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-y-10 sm:gap-x-6 lg:gap-x-0 mb-12 md:mb-16">
            
            {/* Column 1: Brand & Description */}
            <div className="flex flex-col items-start pr-0 lg:pr-8 lg:border-r border-[#333333]">
              <div className="mb-6 relative z-10 w-full max-w-[200px]">
                <SiteBrand variant="footer" align="left" />
              </div>
              <p className="text-sm md:text-[13px] text-[#B3B3B3] leading-relaxed mb-8 max-w-[280px]">
                {t('footer.description', "India's trusted marketplace for buying and selling JCB and heavy construction machines. Verified dealers. Fair prices. Reliable deals.")}
              </p>
              
              {/* Social Icons */}
              <div className="flex items-center space-x-4">
                {visibleSocialLinks.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={platformLabelMap[String(item.platform || '').toUpperCase()] || String(item.platform || 'Social Link')}
                    className="w-10 h-10 rounded-full border border-[#333333] flex items-center justify-center hover:border-[#F0C85C] hover:text-[#F0C85C] transition-colors"
                  >
                    <SocialIcon platform={String(item.platform || '').toUpperCase()} />
                  </a>
                ))}
              </div>
            </div>

            {/* Column 2: Quick Links */}
            <div className="flex flex-col items-start lg:px-10 lg:border-r border-[#333333]">
              <h4 className="text-white text-[12px] font-bold tracking-[0.05em] uppercase mb-6 flex flex-col">
                {t('footer.quickLinks', 'Quick Links')}
                <span className="w-6 h-[2px] bg-[#F0C85C] mt-3"></span>
              </h4>
              <ul className="space-y-4">
                <li>
                  <Link href="/" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors whitespace-nowrap">
                    <ChevronRight size={14} className="text-[#F0C85C] mr-3 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    {t('navbar.home')}
                  </Link>
                </li>
                <li>
                  <Link href="/machines" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors whitespace-nowrap">
                    <ChevronRight size={14} className="text-[#F0C85C] mr-3 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    {t('navbar.machines')}
                  </Link>
                </li>
                <li>
                  <button
                    onClick={handleOpenSellVehicle}
                    className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors whitespace-nowrap text-left"
                  >
                    <ChevronRight size={14} className="text-[#F0C85C] mr-3 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    {t('navbar.sellVehicle')}
                  </button>
                </li>
                <li>
                  <Link href="/sold-vehicles" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors whitespace-nowrap">
                    <ChevronRight size={14} className="text-[#F0C85C] mr-3 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    {t('navbar.soldVehicles')}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3: Useful Links */}
            <div className="flex flex-col items-start lg:px-10 lg:border-r border-[#333333]">
              <h4 className="text-white text-[12px] font-bold tracking-[0.05em] uppercase mb-6 flex flex-col">
                {t('footer.usefulLinks', 'Useful Links')}
                <span className="w-6 h-[2px] bg-[#F0C85C] mt-3"></span>
              </h4>
              <ul className="space-y-4">
                <li>
                  <Link href="/privacy-policy" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors whitespace-nowrap">
                    <ChevronRight size={14} className="text-[#F0C85C] mr-3 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    {t('legalPages.privacyPolicy', 'Privacy Policy')}
                  </Link>
                </li>
                <li>
                  <Link href="/terms-and-conditions" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors whitespace-nowrap">
                    <ChevronRight size={14} className="text-[#F0C85C] mr-3 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    {t('legalPages.termsAndConditions', 'Terms & Conditions')}
                  </Link>
                </li>
                <li>
                  <Link href="/disclaimer" className="group flex items-center text-[13px] text-[#B3B3B3] hover:text-white transition-colors whitespace-nowrap">
                    <ChevronRight size={14} className="text-[#F0C85C] mr-3 group-hover:translate-x-1 transition-transform flex-shrink-0" />
                    {t('legalPages.disclaimer', 'Disclaimer')}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 4: Contact */}
            <div className="flex flex-col items-start lg:pl-10">
              <h4 className="text-white text-[12px] font-bold tracking-[0.05em] uppercase mb-6 flex flex-col">
                {t('footer.contact', 'Contact')}
                <span className="w-6 h-[2px] bg-[#F0C85C] mt-3"></span>
              </h4>
              
              <div className="flex flex-col space-y-5 w-full">
                {/* Phone */}
                {Boolean(contact.phoneNumber) && (
                  <div className="flex items-start group cursor-default">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full border border-[#333333] flex items-center justify-center mr-4 group-hover:border-[#F0C85C] group-hover:bg-[#F0C85C]/10 transition-colors">
                      <Phone size={14} className="text-[#F0C85C]" />
                    </div>
                    <div className="flex flex-col justify-center min-h-[36px]">
                      <p className="text-[13px] text-white font-medium leading-none">
                        {contact.phoneNumber}
                      </p>
                      {Boolean(contact.phoneLabel) && (
                        <p className="text-[11px] text-[#8C8C8C] mt-1.5 leading-none">
                          {contact.phoneLabel}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Email */}
                {Boolean(contact.emailAddress) && (
                  <div className="flex items-start group cursor-default">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full border border-[#333333] flex items-center justify-center mr-4 group-hover:border-[#F0C85C] group-hover:bg-[#F0C85C]/10 transition-colors">
                      <Mail size={14} className="text-[#F0C85C]" />
                    </div>
                    <div className="flex flex-col justify-center min-h-[36px]">
                      <a 
                        href={`mailto:${contact.emailAddress}`}
                        className="text-[13px] text-white font-medium leading-none hover:text-[#F0C85C] transition-colors"
                      >
                        {contact.emailAddress}
                      </a>
                      {Boolean(contact.emailLabel) && (
                        <p className="text-[11px] text-[#8C8C8C] mt-1.5 leading-none">
                          {contact.emailLabel}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Address */}
                {Boolean(contact.address) && (
                  <div className="flex items-start group cursor-default">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full border border-[#333333] flex items-center justify-center mr-4 group-hover:border-[#F0C85C] group-hover:bg-[#F0C85C]/10 transition-colors">
                      <MapPin size={14} className="text-[#F0C85C]" />
                    </div>
                    <div className="flex flex-col justify-center min-h-[36px]">
                      <p className="text-[12px] text-[#8C8C8C] leading-[1.4] pr-2 whitespace-pre-line">
                        {contact.address}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Bottom Bar */}
          <div className="pt-6 border-t border-[#333333] flex flex-col sm:flex-row justify-between items-center space-y-4 sm:space-y-0 text-[12px] text-[#8C8C8C]">
            
            <div className="flex items-center text-center sm:text-left">
              <span>{t('footer.copyright', '? 2025-2026 JCB Exchange. All rights reserved.')}</span>
            </div>

            <div className="flex items-center">
              <span className="flex items-center justify-center">
                {t('footer.craftedWith', 'Crafted with')} <span className="mx-1 text-[16px] leading-none text-red-500">?</span> {t('footer.by', 'by')} <a href="https://webitof.com/" target="_blank" rel="noopener noreferrer" className="ml-1 underline transition-colors hover:text-white">Webitof</a>
              </span>
            </div>

          </div>
        </div>
      </footer>

      {isSellModalOpen ? <SellVehicleModal isOpen={isSellModalOpen} onClose={() => setIsSellModalOpen(false)} /> : null}
      {isPrimePaymentOpen ? (
        <CustomerPrimePaymentModal
          isOpen={isPrimePaymentOpen}
          feature="SELL_LISTING"
          onClose={() => setIsPrimePaymentOpen(false)}
          onAccessGranted={() => {
            setIsPrimePaymentOpen(false);
            setIsSellModalOpen(true);
          }}
        />
      ) : null}
    </>
  );
}
