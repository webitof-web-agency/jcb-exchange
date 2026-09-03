'use client';

import { useEffect, useRef, useState } from 'react';
import type { AxiosError } from 'axios';
import { Link as LinkIcon, Mail, MapPin, Phone, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import SearchableSelect, { type Option } from '@/components/ui/SearchableSelect';
import { useTranslation } from '@/hooks/useTranslation';

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

type FooterLegalPages = {
  privacyPolicy?: string | null;
  termsConditions?: string | null;
  disclaimer?: string | null;
};

type FooterResponse = {
  socialLinks: FooterSocialLink[];
  contact: FooterContact;
  legalPages?: FooterLegalPages;
};

const SOCIAL_PLATFORM_OPTIONS: Option[] = [
  { id: 'FACEBOOK', name: 'Facebook' },
  { id: 'INSTAGRAM', name: 'Instagram' },
  { id: 'TWITTER', name: 'Twitter' },
];

const FONT_SIZE_OPTIONS: Option[] = [
  { id: '14', name: '14 px' },
  { id: '16', name: '16 px' },
  { id: '18', name: '18 px' },
  { id: '24', name: '24 px' },
  { id: '32', name: '32 px' },
];

const TEXT_BLOCK_OPTIONS: Option[] = [
  { id: 'P', name: 'Paragraph' },
  { id: 'H2', name: 'Heading 2' },
  { id: 'H3', name: 'Heading 3' },
];

const DEFAULT_PRIVACY_POLICY = `<h2>1. Information We Collect</h2>
<p>At <strong>JCB Exchange</strong>, we collect personal information such as name, phone number, email address, and equipment listing details when you register as a buyer, seller, or dealer.</p>

<h2>2. How We Use Your Information</h2>
<p>We utilize the collected information to:</p>
<ul>
  <li>Facilitate direct communication between buyers and verified dealers.</li>
  <li>Verify equipment listings and prevent fraudulent transactions.</li>
  <li>Send platform updates, transaction receipts, and customer support notifications.</li>
</ul>

<h2>3. Data Security & Protection</h2>
<p>Your data is encrypted using industry-standard SSL protocols and protected in secure cloud infrastructure. We do not sell or rent user data to third parties.</p>`;

const DEFAULT_TERMS_CONDITIONS = `<h2>1. Acceptance of Terms</h2>
<p>By accessing <strong>JCB Exchange</strong>, you agree to comply with all marketplace rules, seller guidelines, and Indian commercial laws governing machinery trading.</p>

<h2>2. Seller & Listing Responsibilities</h2>
<p>Sellers must provide accurate machine details including:</p>
<ul>
  <li>Actual operational hours and manufacturing year.</li>
  <li>Clear photos of engine, chassis, and hydraulic components.</li>
  <li>Valid ownership and RC documents upon buyer request.</li>
</ul>

<h2>3. Transaction Facilitation</h2>
<p>JCB Exchange serves as a listing facilitator. Direct physical inspection and payment verification between buyer and seller are recommended prior to purchase.</p>`;

const DEFAULT_DISCLAIMER = `<h2>1. Facilitator Notice</h2>
<p><strong>JCB Exchange</strong> provides a digital listing platform connecting buyers and sellers of construction machinery across India.</p>

<h2>2. Machine Inspection Disclaimer</h2>
<p>While we encourage dealers to verify listings, buyers are advised to conduct independent technical inspections of all heavy equipment prior to completing financial transfers.</p>

<h2>3. Limitation of Liability</h2>
<p>JCB Exchange is not liable for secondary damages, operational breakdown, or misrepresentation by independent third-party sellers on the platform.</p>`;

const LEGAL_ALLOWED_TAGS = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h2', 'h3', 'span', 'div']);
const LEGAL_ALLOWED_CLASS_NAMES = new Set(['legal-callout']);
const LEGAL_ALLOWED_STYLE_PROPERTIES = new Set([
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'background-color',
  'color',
]);

const LEGAL_CONTENT_CLASS_NAME =
  'prose max-w-none text-sm text-gray-700 leading-relaxed prose-headings:text-gray-900 prose-headings:font-semibold prose-p:text-gray-700 prose-p:leading-7 prose-li:text-gray-700 prose-li:leading-7 prose-ul:my-4 prose-ol:my-4 [&_.legal-callout]:my-4 [&_.legal-callout]:rounded-2xl [&_.legal-callout]:border-l-4 [&_.legal-callout]:border-amber-400 [&_.legal-callout]:bg-amber-50 [&_.legal-callout]:px-4 [&_.legal-callout]:py-3 [&_.legal-callout]:text-amber-950';

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || fallbackMessage;
};

const createEmptySocialLink = (): FooterSocialLink => ({
  id: globalThis.crypto?.randomUUID?.() || `footer-social-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  platform: 'FACEBOOK',
  url: '',
  displayOrder: 0,
});

const getLegalPageField = (tab: 'privacy' | 'terms' | 'disclaimer'): keyof FooterLegalPages => {
  if (tab === 'privacy') {
    return 'privacyPolicy';
  }

  if (tab === 'terms') {
    return 'termsConditions';
  }

  return 'disclaimer';
};

const getDefaultLegalPageContent = (tab: 'privacy' | 'terms' | 'disclaimer') => {
  if (tab === 'privacy') {
    return DEFAULT_PRIVACY_POLICY;
  }

  if (tab === 'terms') {
    return DEFAULT_TERMS_CONDITIONS;
  }

  return DEFAULT_DISCLAIMER;
};

const normalizeLegalHtml = (html: string) =>
  html
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+<\/(p|div|h2|h3|li)>/g, '</$1>')
    .replace(/<(p|div)><br><\/(p|div)>/g, '')
    .trim();

const sanitizeLegalHtml = (html: string) => {
  if (typeof window === 'undefined') {
    return normalizeLegalHtml(html);
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = parsed.body.firstElementChild;

  if (!root) {
    return '';
  }

  const sanitizeNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }

    const element = node as HTMLElement;
    const tagName = element.tagName.toLowerCase();

    if (!LEGAL_ALLOWED_TAGS.has(tagName)) {
      const parent = element.parentNode;
      if (!parent) {
        return;
      }

      while (element.firstChild) {
        parent.insertBefore(element.firstChild, element);
      }

      parent.removeChild(element);
      return;
    }

    Array.from(element.attributes).forEach((attribute) => {
      const attributeName = attribute.name.toLowerCase();

      if (attributeName === 'style') {
        const safeStyle = attribute.value
          .split(';')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map((entry) => {
            const [rawProperty, ...valueParts] = entry.split(':');
            const property = rawProperty?.trim().toLowerCase();
            const value = valueParts.join(':').trim();

            if (!property || !value || !LEGAL_ALLOWED_STYLE_PROPERTIES.has(property)) {
              return null;
            }

            if (property === 'font-size' && !/^\d+(px|rem|em|%)$/i.test(value)) {
              return null;
            }

            return `${property}: ${value}`;
          })
          .filter((entry): entry is string => Boolean(entry))
          .join('; ');

        if (safeStyle) {
          element.setAttribute('style', safeStyle);
        } else {
          element.removeAttribute('style');
        }

        return;
      }

      if (attributeName === 'class') {
        const safeClasses = attribute.value
          .split(/\s+/)
          .map((value) => value.trim())
          .filter((value) => LEGAL_ALLOWED_CLASS_NAMES.has(value));

        if (safeClasses.length > 0) {
          element.setAttribute('class', safeClasses.join(' '));
        } else {
          element.removeAttribute('class');
        }

        return;
      }

      if (attributeName.startsWith('on')) {
        element.removeAttribute(attribute.name);
        return;
      }

      element.removeAttribute(attribute.name);
    });

    Array.from(element.childNodes).forEach(sanitizeNode);
  };

  Array.from(root.childNodes).forEach(sanitizeNode);
  return normalizeLegalHtml(root.innerHTML);
};

export default function FooterContentSettings() {
  const { t } = useTranslation();
  const [socialLinks, setSocialLinks] = useState<FooterSocialLink[]>([]);
  const [contact, setContact] = useState<FooterContact>({
    phoneNumber: '',
    phoneLabel: '',
    emailAddress: '',
    emailLabel: '',
    address: '',
  });
  const [legalPages, setLegalPages] = useState<FooterLegalPages>({
    privacyPolicy: '',
    termsConditions: '',
    disclaimer: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'social' | 'contact' | 'useful'>('social');
  const [activeUsefulSubTab, setActiveUsefulSubTab] = useState<'privacy' | 'terms' | 'disclaimer'>('privacy');
  const [editorViewMode, setEditorViewMode] = useState<'editor' | 'preview'>('editor');
  const [selectedFontSize, setSelectedFontSize] = useState('16');
  const [selectedTextBlock, setSelectedTextBlock] = useState('P');
  const editorRef = useRef<HTMLDivElement | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const activeLegalField = getLegalPageField(activeUsefulSubTab);
  const activeLegalContent = legalPages[activeLegalField] || '';

  useEffect(() => {
    let cancelled = false;

    const loadFooterSettings = async () => {
      setLoading(true);

      try {
        const response = await api.get<FooterResponse>('/superadmin/footer');

        if (cancelled) {
          return;
        }

        setSocialLinks(
          (response.data.socialLinks || []).map((item, index) => ({
            ...item,
            platform: item.platform || 'FACEBOOK',
            displayOrder: index,
          })),
        );
        setContact({
          phoneNumber: response.data.contact?.phoneNumber || '',
          phoneLabel: response.data.contact?.phoneLabel || '',
          emailAddress: response.data.contact?.emailAddress || '',
          emailLabel: response.data.contact?.emailLabel || '',
          address: response.data.contact?.address || '',
        });
        setLegalPages({
          privacyPolicy: sanitizeLegalHtml(response.data.legalPages?.privacyPolicy || DEFAULT_PRIVACY_POLICY),
          termsConditions: sanitizeLegalHtml(response.data.legalPages?.termsConditions || DEFAULT_TERMS_CONDITIONS),
          disclaimer: sanitizeLegalHtml(response.data.legalPages?.disclaimer || DEFAULT_DISCLAIMER),
        });
      } catch (error) {
        if (!cancelled) {
          toast.error(getApiErrorMessage(error, t('footerSettings.loadFailed', 'Unable to load footer settings.')));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadFooterSettings();

    return () => {
      cancelled = true;
    };
  }, [t]);

  const updateSocialLink = (id: string, nextState: Partial<FooterSocialLink>) => {
    setSocialLinks((current) =>
      current.map((item, index) =>
        item.id === id
          ? {
              ...item,
              ...nextState,
              displayOrder: index,
            }
          : {
              ...item,
              displayOrder: index,
            },
      ),
    );
  };

  const handleAddSocialLink = () => {
    setSocialLinks((current) => [
      ...current,
      {
        ...createEmptySocialLink(),
        displayOrder: current.length,
      },
    ]);
  };

  const handleRemoveSocialLink = (id: string) => {
    setSocialLinks((current) =>
      current
        .filter((item) => item.id !== id)
        .map((item, index) => ({
          ...item,
          displayOrder: index,
        })),
    );
  };

  const updateLegalPageContent = (field: keyof FooterLegalPages, content: string) => {
    setLegalPages((prev) => ({
      ...prev,
      [field]: sanitizeLegalHtml(content),
    }));
  };

  useEffect(() => {
    if (!editorRef.current || activeTab !== 'useful' || editorViewMode !== 'editor') {
      return;
    }

    if (editorRef.current.innerHTML !== activeLegalContent) {
      editorRef.current.innerHTML = activeLegalContent;
    }
  }, [activeLegalContent, activeTab, editorViewMode]);

  const saveSelection = () => {
    if (!editorRef.current || typeof window === 'undefined') {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !editorRef.current.contains(selection.anchorNode)) {
      return;
    }

    savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
  };

  const restoreSelection = () => {
    if (typeof window === 'undefined' || !savedSelectionRef.current) {
      return false;
    }

    const selection = window.getSelection();
    if (!selection) {
      return false;
    }

    selection.removeAllRanges();
    selection.addRange(savedSelectionRef.current);
    return true;
  };

  const handleEditorInput = () => {
    if (!editorRef.current) {
      return;
    }

    updateLegalPageContent(activeLegalField, editorRef.current.innerHTML);
    saveSelection();
  };

  const runEditorCommand = (command: string, value?: string) => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus();
    restoreSelection();
    document.execCommand(command, false, value);
    handleEditorInput();
  };

  const applyTextBlock = (value: string) => {
    setSelectedTextBlock(value);

    if (value === 'P') {
      runEditorCommand('formatBlock', '<p>');
      return;
    }

    runEditorCommand('formatBlock', `<${value.toLowerCase()}>`);
  };

  const applyFontSize = (value: string) => {
    setSelectedFontSize(value);

    if (!editorRef.current || typeof window === 'undefined') {
      return;
    }

    editorRef.current.focus();
    restoreSelection();

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return;
    }

    const range = selection.getRangeAt(0);
    const span = document.createElement('span');
    span.style.fontSize = `${value}px`;
    span.appendChild(range.extractContents());
    range.insertNode(span);

    selection.removeAllRanges();
    const nextRange = document.createRange();
    nextRange.selectNodeContents(span);
    selection.addRange(nextRange);
    savedSelectionRef.current = nextRange.cloneRange();
    handleEditorInput();
  };

  const handleResetToDefault = () => {
    updateLegalPageContent(activeLegalField, getDefaultLegalPageContent(activeUsefulSubTab));
    toast.info(t('footerSettings.resetSuccess', 'Reset to default template.'));
  };

  const handleSave = async () => {
    const normalizedSocialLinks = socialLinks.map((item, index) => ({
      id: item.id,
      platform: item.platform,
      url: item.url.trim(),
      displayOrder: index,
    }));

    const hasInvalidUrl = normalizedSocialLinks.some((item) => !item.url);
    if (hasInvalidUrl) {
      toast.error(t('footerSettings.invalidSocialUrl', 'Each social media item needs a valid URL.'));
      return;
    }

    if (contact.phoneNumber && contact.phoneNumber.trim().length > 0) {
      const digitsOnly = contact.phoneNumber.trim().replace(/\D/g, '');
      if (digitsOnly.length !== 10) {
        toast.error(t('footerSettings.invalidPhone', 'Phone number must be exactly 10 digits.'));
        return;
      }
    }

    if (contact.emailAddress && contact.emailAddress.trim().length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(contact.emailAddress.trim())) {
        toast.error(t('footerSettings.invalidEmail', 'Please enter a valid email address.'));
        return;
      }
    }

    setSaving(true);

    try {
      const response = await api.put<FooterResponse & { message: string }>('/superadmin/footer', {
        socialLinks: normalizedSocialLinks,
        contact,
        legalPages: {
          privacyPolicy: sanitizeLegalHtml(legalPages.privacyPolicy || DEFAULT_PRIVACY_POLICY),
          termsConditions: sanitizeLegalHtml(legalPages.termsConditions || DEFAULT_TERMS_CONDITIONS),
          disclaimer: sanitizeLegalHtml(legalPages.disclaimer || DEFAULT_DISCLAIMER),
        },
      });

      setSocialLinks(
        (response.data.socialLinks || []).map((item, index) => ({
          ...item,
          displayOrder: index,
        })),
      );
      setContact({
        phoneNumber: response.data.contact?.phoneNumber || '',
        phoneLabel: response.data.contact?.phoneLabel || '',
        emailAddress: response.data.contact?.emailAddress || '',
        emailLabel: response.data.contact?.emailLabel || '',
        address: response.data.contact?.address || '',
      });
      setLegalPages({
        privacyPolicy: sanitizeLegalHtml(response.data.legalPages?.privacyPolicy || DEFAULT_PRIVACY_POLICY),
        termsConditions: sanitizeLegalHtml(response.data.legalPages?.termsConditions || DEFAULT_TERMS_CONDITIONS),
        disclaimer: sanitizeLegalHtml(response.data.legalPages?.disclaimer || DEFAULT_DISCLAIMER),
      });
      toast.success(response.data.message);
    } catch (error) {
      toast.error(getApiErrorMessage(error, t('footerSettings.saveFailed', 'Unable to save footer settings.')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-[#FFC107]/20" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-yellow-200">{t('footerSettings.moduleLabel', 'Footer Module')}</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-white">{t('footerSettings.pageTitle', 'Footer Content Settings')}</h2>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
            <ShieldCheck className="h-4 w-4" />
            {t('footerSettings.dynamicEnabled', 'Dynamic footer enabled')}
          </span>
        </div>
      </div>

      {/* Horizontal Tabs Bar with Horizontal Scroll for Mobile */}
      <div className="border-b border-gray-200 bg-gray-50/80 px-4 sm:px-6 pt-4">
        <div className="flex space-x-4 sm:space-x-6 overflow-x-auto no-scrollbar whitespace-nowrap pb-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('social')}
            className={`flex items-center gap-2 border-b-2 pb-3.5 text-sm font-semibold transition-all shrink-0 ${
              activeTab === 'social'
                ? 'border-[#FFC107] font-bold text-gray-900'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <LinkIcon className="h-4 w-4 text-[#D97706]" />
            {t('footerSettings.socialMediaLinks', 'Social Media Links')}
            <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
              {socialLinks.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('contact')}
            className={`flex items-center gap-2 border-b-2 pb-3.5 text-sm font-semibold transition-all shrink-0 ${
              activeTab === 'contact'
                ? 'border-[#FFC107] font-bold text-gray-900'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <Phone className="h-4 w-4 text-[#D97706]" />
            {t('footerSettings.contactDetails', 'Contact Details')}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('useful')}
            className={`flex items-center gap-2 border-b-2 pb-3.5 text-sm font-semibold transition-all shrink-0 ${
              activeTab === 'useful'
                ? 'border-[#FFC107] font-bold text-gray-900'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}
          >
            <ShieldCheck className="h-4 w-4 text-[#D97706]" />
            {t('footerSettings.usefulLinks', 'Useful Links')}
          </button>
        </div>
      </div>

      <div className="space-y-6 p-4 sm:p-6">
        {activeTab === 'social' && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{t('footerSettings.socialMediaLinks', 'Social Media Links')}</h3>
              </div>
              <button
                type="button"
                onClick={handleAddSocialLink}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:border-[#FFC107] hover:bg-[#FFF9E6] w-full sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                {t('footerSettings.addSocialLink', 'Add Social Link')}
              </button>
            </div>

            {loading ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-sm text-gray-500">
                {t('footerSettings.loading', 'Loading footer settings...')}
              </div>
            ) : socialLinks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-8 text-sm text-gray-500">
                {t('footerSettings.noSocialLinks', 'No social links added yet. Click "Add Social Link" above.')}
              </div>
            ) : (
              <div className="space-y-4">
                {socialLinks.map((item) => (
                  <div key={item.id} className="grid gap-4 rounded-xl border border-gray-200 bg-white p-4 grid-cols-1 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('footerSettings.platform', 'Platform')}</span>
                      <SearchableSelect
                        options={SOCIAL_PLATFORM_OPTIONS}
                        value={item.platform}
                        displayValue={SOCIAL_PLATFORM_OPTIONS.find((option) => option.id === item.platform)?.name || 'Facebook'}
                        onChange={(option) => updateSocialLink(item.id, { platform: String(option.id) })}
                        placeholder={t('footerSettings.selectPlatform', 'Select platform')}
                        searchable={false}
                        className="w-full"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('footerSettings.redirectUrl', 'Redirect URL')}</span>
                      <div className="relative">
                        <LinkIcon className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                        <input
                          type="text"
                          value={item.url}
                          onChange={(event) => updateSocialLink(item.id, { url: event.target.value })}
                          placeholder={t('footerSettings.redirectPlaceholder', 'https://example.com/profile')}
                          className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                        />
                      </div>
                    </label>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveSocialLink(item.id)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 transition hover:bg-red-100 w-full lg:w-auto"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('footerSettings.remove', 'Remove')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'contact' && (
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-gray-900">{t('footerSettings.contactDetails', 'Contact Details')}</h3>
            </div>

            <div className="grid gap-5 grid-cols-1 md:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('footerSettings.phoneNumber', 'Phone Number')}</span>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={contact.phoneNumber || ''}
                    onChange={(event) => {
                      const onlyDigits = event.target.value.replace(/\D/g, '').slice(0, 10);
                      setContact((current) => ({ ...current, phoneNumber: onlyDigits }));
                    }}
                    placeholder={t('footerSettings.phonePlaceholder', 'e.g. 9876543210')}
                    className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('footerSettings.phoneHelperText', 'Phone Helper Text')}</span>
                <input
                  type="text"
                  value={contact.phoneLabel || ''}
                  onChange={(event) => setContact((current) => ({ ...current, phoneLabel: event.target.value }))}
                  placeholder={t('footerSettings.phoneHelperPlaceholder', 'e.g. Mon - Sat: 9:00 AM - 6:00 PM')}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('footerSettings.emailAddress', 'Email Address')}</span>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                  <input
                    type="email"
                    value={contact.emailAddress || ''}
                    onChange={(event) => setContact((current) => ({ ...current, emailAddress: event.target.value }))}
                    placeholder={t('footerSettings.emailPlaceholder', 'e.g. hello@jcbexchange.com')}
                    className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('footerSettings.emailHelperText', 'Email Helper Text')}</span>
                <input
                  type="text"
                  value={contact.emailLabel || ''}
                  onChange={(event) => setContact((current) => ({ ...current, emailLabel: event.target.value }))}
                  placeholder={t('footerSettings.emailHelperPlaceholder', "e.g. We'll get back to you")}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                />
              </label>
            </div>

            <label className="mt-5 block">
              <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('footerSettings.address', 'Address')}</span>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
                <textarea
                  value={contact.address || ''}
                  onChange={(event) => setContact((current) => ({ ...current, address: event.target.value }))}
                  placeholder={t('footerSettings.addressPlaceholder', 'JCB Exchange, Plot No. 23\nSector 18, Gurugram\nHaryana 122015, India')}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                />
              </div>
            </label>
          </div>
        )}

        {activeTab === 'useful' && (
          <div className="space-y-5 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('footerSettings.usefulLinksManager', 'Useful Links Content Manager')}</h3>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveUsefulSubTab('privacy')}
                  className={`rounded-lg px-3 sm:px-4 py-2 text-xs font-semibold transition flex-1 sm:flex-initial text-center ${
                    activeUsefulSubTab === 'privacy'
                      ? 'bg-[#FFC107] font-bold text-black shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('legalPages.privacyPolicy', 'Privacy Policy')}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveUsefulSubTab('terms')}
                  className={`rounded-lg px-3 sm:px-4 py-2 text-xs font-semibold transition flex-1 sm:flex-initial text-center ${
                    activeUsefulSubTab === 'terms'
                      ? 'bg-[#FFC107] font-bold text-black shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('legalPages.termsAndConditions', 'Terms & Conditions')}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveUsefulSubTab('disclaimer')}
                  className={`rounded-lg px-3 sm:px-4 py-2 text-xs font-semibold transition flex-1 sm:flex-initial text-center ${
                    activeUsefulSubTab === 'disclaimer'
                      ? 'bg-[#FFC107] font-bold text-black shadow-xs'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {t('legalPages.disclaimer', 'Disclaimer')}
                </button>
              </div>

              <div className="flex items-center space-x-1.5 rounded-lg border border-gray-200 bg-gray-100 p-1 w-full sm:w-auto justify-center">
                <button
                  type="button"
                  onClick={() => setEditorViewMode('editor')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition flex-1 sm:flex-initial text-center ${
                    editorViewMode === 'editor' ? 'bg-white font-semibold text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('footerSettings.editorMode', 'Editor Mode')}
                </button>
                <button
                  type="button"
                  onClick={() => setEditorViewMode('preview')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition flex-1 sm:flex-initial text-center ${
                    editorViewMode === 'preview' ? 'bg-white font-semibold text-gray-900 shadow-xs' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('footerSettings.livePreview', 'Live Document Preview')}
                </button>
              </div>
            </div>

            {editorViewMode === 'editor' ? (
              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 shadow-xs">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-gray-200 pb-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{t('footerSettings.toolbar', 'Toolbar:')}</span>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <span className="font-medium text-gray-700 shrink-0">{t('footerSettings.textStyle', 'Text Style:')}</span>
                      <div className="w-full sm:w-[190px]">
                        <SearchableSelect
                          options={TEXT_BLOCK_OPTIONS}
                          value={selectedTextBlock}
                          displayValue={TEXT_BLOCK_OPTIONS.find((opt) => opt.id === selectedTextBlock)?.name || 'Paragraph (Normal Text)'}
                          onChange={(option) => applyTextBlock(String(option.id))}
                          placeholder={t('footerSettings.textStylePlaceholder', 'Text style')}
                          searchable={false}
                          className="w-full text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <span className="font-medium text-gray-700 shrink-0">{t('footerSettings.fontSize', 'Font Size:')}</span>
                      <div className="w-full sm:w-[150px]">
                        <SearchableSelect
                          options={FONT_SIZE_OPTIONS}
                          value={selectedFontSize}
                          displayValue={FONT_SIZE_OPTIONS.find((opt) => opt.id === selectedFontSize)?.name || '16 px (Normal)'}
                          onChange={(option) => applyFontSize(String(option.id))}
                          placeholder={t('footerSettings.fontSizePlaceholder', 'Font size')}
                          searchable={false}
                          className="w-full text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1 border-l border-gray-200 pl-2">
                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runEditorCommand('bold')}
                        className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 font-bold text-gray-800 hover:border-amber-300 hover:bg-amber-100"
                        title={t('footerSettings.boldText', 'Bold text')}
                      >
                        B
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runEditorCommand('italic')}
                        className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 font-semibold italic text-gray-800 hover:border-amber-300 hover:bg-amber-100"
                        title={t('footerSettings.italicText', 'Italic text')}
                      >
                        I
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runEditorCommand('underline')}
                        className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 font-semibold underline text-gray-800 hover:border-amber-300 hover:bg-amber-100"
                        title={t('footerSettings.underlineText', 'Underline text')}
                      >
                        U
                      </button>

                      <button
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runEditorCommand('insertUnorderedList')}
                        className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-800 hover:border-amber-300 hover:bg-amber-100"
                        title={t('footerSettings.bulletList', 'Bullet list')}>`r`n                        {`? ${t('footerSettings.bulletListLabel', 'Bullet List')}`}`r`n                      </button>
                    </div>
                  </div>

                  <div className="self-end lg:self-auto">
                    <button
                      type="button"
                      onClick={handleResetToDefault}
                      className="rounded border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-200"
                    >
                      {t('footerSettings.resetTemplate', 'Reset Template')}
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                  <span className="font-semibold text-amber-700">{t('footerSettings.tipLabel', 'Tip:')}</span>
                  <span>{t('footerSettings.tipText', 'Select any text below and use Text Style for section titles, paragraphs, and B / I / U / Bullet List to format.')}</span>
                </div>

                <div>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                    {activeUsefulSubTab === 'privacy'
                      ? t('footerSettings.privacyPageContent', 'Privacy Policy Page Content')
                      : activeUsefulSubTab === 'terms'
                        ? t('footerSettings.termsPageContent', 'Terms & Conditions Page Content')
                        : t('footerSettings.disclaimerPageContent', 'Disclaimer Page Content')}
                  </span>

                  <div className="rounded-2xl border border-gray-300 bg-white">
                    <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-500">
                      {t('footerSettings.editorHelp', 'Select text and apply font size, bold, headings, lists, or highlight formatting directly.')}
                    </div>
                    <div
                      ref={editorRef}
                      contentEditable
                      suppressContentEditableWarning
                      onInput={handleEditorInput}
                      onBlur={saveSelection}
                      onKeyUp={saveSelection}
                      onMouseUp={saveSelection}
                      className={`${LEGAL_CONTENT_CLASS_NAME} min-h-[360px] px-4 py-4 outline-none`}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
                <div className="mb-4 flex items-center justify-between border-b border-gray-100 pb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600">
                    {t('footerSettings.livePreviewLabel', 'Live Document Preview')} ({activeUsefulSubTab === 'privacy' ? t('legalPages.privacyPolicy', 'Privacy Policy') : activeUsefulSubTab === 'terms' ? t('legalPages.termsAndConditions', 'Terms & Conditions') : t('legalPages.disclaimer', 'Disclaimer')})
                  </span>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    {t('footerSettings.exactFrontendStyle', 'Exact Frontend Style')}
                  </span>
                </div>

                <div
                  className={LEGAL_CONTENT_CLASS_NAME}
                  dangerouslySetInnerHTML={{
                    __html:
                      activeUsefulSubTab === 'privacy'
                        ? legalPages.privacyPolicy || DEFAULT_PRIVACY_POLICY
                        : activeUsefulSubTab === 'terms'
                          ? legalPages.termsConditions || DEFAULT_TERMS_CONDITIONS
                          : legalPages.disclaimer || DEFAULT_DISCLAIMER,
                  }}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#FFC107] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            {saving ? t('footerSettings.saving', 'Saving...') : t('footerSettings.saveButton', 'Save Footer Settings')}
          </button>
        </div>
      </div>
    </section>
  );
}
