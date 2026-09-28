'use client';

import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import { Phone, Mail, MapPin, Loader2, ArrowRight, ChevronDown } from 'lucide-react';

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

type FooterSettingsResponse = {
  success: boolean;
  data?: {
    socialLinks?: FooterSocialLink[];
    contact?: FooterContact;
  };
};

const emptyContact: FooterContact = {
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
  if (!trimmedValue) return null;
  const candidateValue = /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;
  try {
    const parsedUrl = new URL(candidateValue);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return null;
    return parsedUrl.toString();
  } catch {
    return null;
  }
};

const SocialIcon = ({ platform }: { platform: string }) => {
  switch (platform) {
    case 'FACEBOOK':
      return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>;
    case 'INSTAGRAM':
      return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></svg>;
    case 'TWITTER':
      return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4l11.733 16H20L8.267 4z" /><path d="M4 20l6.768-6.768" /><path d="M13.227 10.773L20 4" /></svg>;
    case 'LINKEDIN':
      return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" /><rect width="4" height="12" x="2" y="9" /><circle cx="4" cy="4" r="2" /></svg>;
    case 'YOUTUBE':
      return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.56 49.56 0 0 1-16.2 0A2 2 0 0 1 2.5 17" /><path d="m10 15 5-3-5-3z" /></svg>;
    case 'WHATSAPP':
      return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.72 13.06c-.29-.15-1.7-.84-1.96-.94-.26-.1-.45-.15-.64.15-.19.29-.74.94-.91 1.13-.17.19-.34.22-.63.08-.29-.15-1.24-.46-2.36-1.46-.87-.78-1.46-1.74-1.63-2.03-.17-.29-.02-.45.13-.6.13-.13.29-.34.43-.51.15-.17.19-.29.29-.49.1-.19.05-.37-.02-.51-.08-.15-.64-1.54-.87-2.11-.23-.55-.46-.48-.64-.49h-.54c-.19 0-.49.08-.74.37s-.98.96-.98 2.34 1 2.72 1.14 2.91c.15.19 1.97 3 4.88 4.08.69.3 1.23.48 1.65.61.69.22 1.31.19 1.8.11.55-.08 1.7-.69 1.94-1.36.24-.67.24-1.25.17-1.36-.07-.11-.26-.18-.55-.33" /><path d="M20.52 3.48A11.86 11.86 0 0 0 12.09 0C5.55 0 .23 5.32.23 11.86c0 2.09.55 4.13 1.6 5.93L0 24l6.39-1.68a11.83 11.83 0 0 0 5.7 1.45h.01c6.54 0 11.86-5.32 11.86-11.86 0-3.17-1.23-6.15-3.44-8.43" /></svg>;
    default:
      return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>;
  }
};

const FAQItem = ({ question, answer }: { question: string; answer: string }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  return (
    <div className="border border-gray-100 bg-white rounded-xl mb-4 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-5 md:p-6 text-left focus:outline-none"
      >
        <h4 className="text-base md:text-lg font-bold text-gray-900 pr-4">{question}</h4>
        <div className={`w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180 bg-[#F0C85C]/10 text-[#F0C85C]' : 'text-gray-400'}`}>
          <ChevronDown size={18} />
        </div>
      </button>
      <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
        <div className="p-5 md:p-6 pt-0 text-gray-600 leading-relaxed">
          {answer}
        </div>
      </div>
    </div>
  );
};


export default function SupportPage() {
  const { t } = useTranslation();
  const [contact, setContact] = useState<FooterContact>(emptyContact);
  const [socialLinks, setSocialLinks] = useState<FooterSocialLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchSupportSettings = async () => {
      try {
        const response = await api.get<FooterSettingsResponse>('/master/footer');
        if (cancelled) return;
        
        const nextSocialLinks = (response.data.data?.socialLinks || [])
          .map((item) => ({
            ...item,
            platform: (item.platform || 'CUSTOM').toUpperCase(),
            url: normalizeExternalUrl(item.url) || '',
          }))
          .filter((item) => item.url)
          .sort((left, right) => left.displayOrder - right.displayOrder);

        setSocialLinks(nextSocialLinks);
        setContact({
          phoneNumber: (response.data.data?.contact?.phoneNumber || '').trim(),
          phoneLabel: (response.data.data?.contact?.phoneLabel || '').trim(),
          emailAddress: (response.data.data?.contact?.emailAddress || '').trim(),
          emailLabel: (response.data.data?.contact?.emailLabel || '').trim(),
          address: (response.data.data?.contact?.address || '').trim(),
        });
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to fetch support details:", error);
          setContact(emptyContact);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void fetchSupportSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Hero Section */}
      <div className="bg-[#1A1A1A] text-white pt-32 pb-24 px-6 md:px-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10 bg-[url('/pattern.svg')] bg-repeat" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <h1 className="text-4xl md:text-5xl font-extrabold mb-6 text-white tracking-tight">
            How can we <span className="text-[#F0C85C]">help you?</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Our support team is here to assist you with any questions or issues you may have. 
            Reach out to us through any of the channels below.
          </p>
        </div>
      </div>

      {/* Content Section */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 md:py-20 -mt-10 relative z-20">
        
        {isLoading ? (
          <div className="flex items-center justify-center p-20 bg-white rounded-2xl shadow-sm border border-gray-100">
            <Loader2 className="w-10 h-10 text-[#F0C85C] animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            
            {/* Phone Card */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col items-center text-center group">
              <div className="w-16 h-16 bg-[#F0C85C]/10 text-[#F0C85C] rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Phone size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Call Us</h3>
              <p className="text-gray-500 mb-6 flex-1 text-sm">
                {contact.phoneLabel || "Available during business hours"}
              </p>
              {contact.phoneNumber ? (
                <a href={`tel:${contact.phoneNumber}`} className="text-[#1A1A1A] font-bold text-lg hover:text-[#F0C85C] transition-colors flex items-center gap-2">
                  {contact.phoneNumber}
                  <ArrowRight size={16} />
                </a>
              ) : (
                <span className="text-gray-400 font-medium">Not Available</span>
              )}
            </div>

            {/* Email Card */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col items-center text-center group">
              <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <Mail size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Email Us</h3>
              <p className="text-gray-500 mb-6 flex-1 text-sm">
                {contact.emailLabel || "We'll get back to you soon"}
              </p>
              {contact.emailAddress ? (
                <a href={`mailto:${contact.emailAddress}`} className="text-[#1A1A1A] font-bold text-base hover:text-blue-600 transition-colors flex items-center gap-2 break-all">
                  {contact.emailAddress}
                  <ArrowRight size={16} />
                </a>
              ) : (
                <span className="text-gray-400 font-medium">Not Available</span>
              )}
            </div>

            {/* Address Card */}
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 hover:shadow-md transition-shadow flex flex-col items-center text-center group">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <MapPin size={28} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Visit Us</h3>
              <p className="text-gray-500 mb-6 flex-1 text-sm">
                Our main office location
              </p>
              {contact.address ? (
                <p className="text-[#1A1A1A] font-medium text-base leading-relaxed">
                  {contact.address}
                </p>
              ) : (
                <span className="text-gray-400 font-medium">Not Available</span>
              )}
            </div>

          </div>
        )}

        {/* Social Media Links Section */}
        {!isLoading && socialLinks.length > 0 && (
          <div className="mt-16 text-center">
            <h3 className="text-xl font-bold text-gray-900 mb-8 tracking-tight">Connect With Us</h3>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {socialLinks.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={platformLabelMap[item.platform] || item.platform}
                  className="group flex flex-col items-center p-4 bg-white border border-gray-100 shadow-sm rounded-xl hover:shadow-md hover:border-[#F0C85C] transition-all min-w-[110px]"
                >
                  <div className="w-12 h-12 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center mb-3 group-hover:bg-[#F0C85C]/10 group-hover:text-[#F0C85C] transition-colors">
                    <SocialIcon platform={item.platform} />
                  </div>
                  <span className="text-[13px] font-semibold text-gray-600 group-hover:text-gray-900 transition-colors">
                    {platformLabelMap[item.platform] || item.platform}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* FAQ Section */}
        {!isLoading && (
          <div className="mt-20 max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-extrabold text-gray-900 mb-4 tracking-tight">Frequently Asked Questions</h2>
              <p className="text-gray-500 text-lg">Find answers to common questions about buying and selling on JCB Exchange.</p>
            </div>
            
            <div className="space-y-4">
              <FAQItem 
                question="How do I sell my machine?" 
                answer="Selling your machine is easy. Just log in, go to the 'Sell Vehicle' page, fill in the details of your machine, upload photos, and set a price. Our team will verify your listing before it becomes public."
              />
              <FAQItem 
                question="Are the buyers and sellers verified?" 
                answer="Yes! We prioritize safety and trust. Dealers and sellers undergo a verification process where we check documentation to ensure genuine transactions."
              />
              <FAQItem 
                question="How can I contact a seller?" 
                answer="When you find a machine you are interested in, click on the 'Contact Seller' button on the machine's detail page. You will need to be logged into your account to view the seller's contact details."
              />
              <FAQItem 
                question="Is there any fee to join?" 
                answer="Yes, we require a Prime membership for our customers to ensure a secure and trusted marketplace. This membership allows you to sell vehicles, contact sellers, and access premium features on our platform."
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
