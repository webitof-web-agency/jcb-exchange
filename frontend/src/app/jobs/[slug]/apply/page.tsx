'use client';

import React, { useState, useEffect, useMemo, useRef, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  User,
  Mail,
  Phone,
  MapPin,
  FileText,
  Upload,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronDown,
  Search,
  Building2,
  Sparkles,
  ShieldCheck,
  Send,
  Link2,
} from 'lucide-react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { useTranslation } from '@/hooks/useTranslation';

interface CustomQuestion {
  id: string;
  question: string;
  type: 'SHORT_TEXT' | 'LONG_TEXT' | 'NUMBER' | 'YES_NO' | 'DROPDOWN' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  options: string[];
  isRequired: boolean;
}

interface JobDetail {
  id: string;
  title: string;
  slug: string;
  jobCode: string;
  locationCity: string;
  locationState: string;
  resumeRequired: boolean;
  coverLetterRequired: boolean;
  customQuestions: CustomQuestion[];
  department: {
    name: string;
  };
}

interface LocationItem {
  id: string;
  name: string;
}

interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (val: string) => void;
  onOpen?: () => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
}

function CustomSelect({
  options,
  value,
  onChange,
  onOpen,
  placeholder = 'Select an option...',
  disabled = false,
  searchable = false,
  className = '',
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  const selectedOption = useMemo(() => {
    return options.find((opt) => String(opt.value) === String(value)) ||
      (value ? { value, label: value } : null);
  }, [options, value]);

  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const q = searchQuery.toLowerCase().trim();
    return options.filter((opt) => opt.label.toLowerCase().includes(q));
  }, [options, searchQuery]);

  return (
    <div className={`relative w-full ${className}`} ref={wrapperRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen((prev) => {
              const next = !prev;
              if (next) onOpen?.();
              return next;
            });
            if (isOpen) setSearchQuery('');
          }
        }}
        className={`flex w-full items-center justify-between rounded-xl border border-gray-200/90 bg-gray-50/80 px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 shadow-2xs transition-all hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none ${
          disabled ? 'cursor-not-allowed bg-gray-100 opacity-60 text-gray-400 border-gray-200' : 'cursor-pointer'
        }`}
      >
        <span className={`truncate ${!selectedOption ? 'text-gray-400 font-normal' : 'text-gray-900 font-medium'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`ml-2 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-gray-600' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute left-0 top-full mt-1 z-50 w-full max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {searchable && options.length > 5 && (
            <div className="sticky top-0 z-10 bg-white pb-1.5 pt-0.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded-lg bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 border border-gray-200 outline-none focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                />
              </div>
            </div>
          )}

          <ul className="space-y-0.5">
            {filteredOptions.length === 0 ? (
              <li className="px-3 py-2 text-xs text-gray-400 italic text-center">No options found</li>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = String(opt.value) === String(value);
                return (
                  <li
                    key={opt.value}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                      isSelected
                        ? 'bg-amber-50 text-amber-900 font-bold'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {opt.label}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function JobApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();
  const { t } = useTranslation();

  const [job, setJob] = useState<JobDetail | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [errorJob, setErrorJob] = useState<string | null>(null);

  // DB Locations State
  const [dbStates, setDbStates] = useState<LocationItem[]>([]);
  const [dbCities, setDbCities] = useState<LocationItem[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [currentCity, setCurrentCity] = useState('');
  const [state, setState] = useState('');
  const [address, setAddress] = useState('');

  const [currentCompany, setCurrentCompany] = useState('');
  const [currentDesignation, setCurrentDesignation] = useState('');
  const [totalExperience, setTotalExperience] = useState('');
  const [relevantExperience, setRelevantExperience] = useState('');
  const [currentCtc, setCurrentCtc] = useState('');
  const [expectedCtc, setExpectedCtc] = useState('');
  const [noticePeriod, setNoticePeriod] = useState('30 Days');
  const [employmentStatus, setEmploymentStatus] = useState('EMPLOYED');

  const [linkedInUrl, setLinkedInUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [coverLetter, setCoverLetter] = useState('');

  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [customAnswers, setCustomAnswers] = useState<Record<string, string | string[]>>({});
  const [consentPrivacy, setConsentPrivacy] = useState(false);
  const [confirmAccurate, setConfirmAccurate] = useState(false);

  // Form status
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    applicationRef: string;
    jobTitle: string;
    candidateName: string;
  } | null>(null);

  useEffect(() => {
    const fetchJob = async () => {
      try {
        setLoadingJob(true);
        const res = await api.get(`/recruitment/public/jobs/${slug}`);
        if (res.data?.success && res.data.job) {
          setJob(res.data.job);
        } else {
          setErrorJob(t('careers.noJobsTitle', 'Job not found or inactive.'));
        }
      } catch {
        setErrorJob(t('careers.unableToLoad', 'Failed to load job posting.'));
      } finally {
        setLoadingJob(false);
      }
    };
    fetchJob();
  }, [slug]);

  // Fetch DB States on demand
  const fetchDbStates = async () => {
    if (dbStates.length > 0) return;
    try {
      setLoadingLocations(true);
      const countriesRes = await api.get<LocationItem[]>('/locations/countries');
      const india = (countriesRes.data || []).find((c) => c.name.toLowerCase() === 'india');
      if (india) {
        const statesRes = await api.get<LocationItem[]>(`/locations/states/${india.id}`);
        setDbStates(statesRes.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch DB states:', err);
    } finally {
      setLoadingLocations(false);
    }
  };

  // State selection handler
  const handleStateSelect = async (stateName: string) => {
    setState(stateName);
    setCurrentCity('');
    setDbCities([]);
    if (!stateName) return;

    try {
      setLoadingLocations(true);
      const matchedState = dbStates.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
      if (matchedState) {
        const citiesRes = await api.get<LocationItem[]>(`/locations/cities/${matchedState.id}`);
        setDbCities(citiesRes.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch DB cities:', err);
    } finally {
      setLoadingLocations(false);
    }
  };

  // Mobile Input: Only digits, max 10 chars
  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/\D/g, '').slice(0, 10);
    setMobile(cleaned);
  };

  // Full Name Input: Only letters and spaces
  const handleFullNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const cleaned = e.target.value.replace(/[^A-Za-z\s]/g, '');
    setFullName(cleaned);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null);
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ];
      const validExts = ['.pdf', '.doc', '.docx'];
      const fileNameLower = file.name.toLowerCase();
      const hasValidExt = validExts.some((ext) => fileNameLower.endsWith(ext));

      if (!validTypes.includes(file.type) && !hasValidExt) {
        setFileError('Invalid file format. Only PDF, DOC, and DOCX files are allowed.');
        setResumeFile(null);
        return;
      }

      // Max 2MB size limit for optimized storage
      if (file.size > 2 * 1024 * 1024) {
        setFileError('File size exceeds 2MB limit. Please upload a smaller resume document.');
        setResumeFile(null);
        return;
      }

      setResumeFile(file);
    }
  };

  const handleCustomAnswerChange = (questionId: string, val: string | string[]) => {
    setCustomAnswers((prev) => ({
      ...prev,
      [questionId]: val,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // 1. Full Name Validation
    if (!fullName.trim() || !/^[A-Za-z\s]+$/.test(fullName.trim())) {
      setFormError('Please enter a valid full name containing only letters and spaces.');
      return;
    }

    // 2. Email Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      setFormError('Please enter a valid email address.');
      return;
    }

    // 3. Mobile Number Validation (Strictly 10 digits)
    if (!mobile.trim() || !/^\d{10}$/.test(mobile.trim())) {
      setFormError('Please enter a valid 10-digit mobile number.');
      return;
    }

    // 4. Experience Validation
    if (totalExperience && relevantExperience) {
      if (parseFloat(relevantExperience) > parseFloat(totalExperience)) {
        setFormError('Relevant experience cannot be greater than total experience.');
        return;
      }
    }

    // 5. Resume Required Check
    if (job?.resumeRequired && !resumeFile) {
      setFormError('Please upload your resume document (PDF/DOC, Max 2MB).');
      return;
    }

    // 6. Consent Check
    if (!consentPrivacy || !confirmAccurate) {
      setFormError('Please check and consent to the privacy policy and accuracy declaration.');
      return;
    }

    // Validate required custom questions
    if (job?.customQuestions) {
      for (const q of job.customQuestions) {
        if (q.isRequired) {
          const ans = customAnswers[q.id];
          if (ans === undefined || ans === null || ans === '' || (Array.isArray(ans) && ans.length === 0)) {
            setFormError(`Please answer the required question: "${q.question}"`);
            return;
          }
        }
      }
    }

    try {
      setSubmitting(true);

      const formData = new FormData();
      formData.append('fullName', fullName.trim());
      formData.append('email', email.trim());
      formData.append('mobile', mobile.trim());
      if (currentCity.trim()) formData.append('currentCity', currentCity.trim());
      if (state.trim()) formData.append('state', state.trim());
      if (address.trim()) formData.append('address', address.trim());

      if (currentCompany.trim()) formData.append('currentCompany', currentCompany.trim());
      if (currentDesignation.trim()) formData.append('currentDesignation', currentDesignation.trim());
      if (totalExperience) formData.append('totalExperience', totalExperience);
      if (relevantExperience) formData.append('relevantExperience', relevantExperience);
      if (currentCtc) formData.append('currentCtc', currentCtc);
      if (expectedCtc) formData.append('expectedCtc', expectedCtc);
      formData.append('noticePeriod', noticePeriod);
      formData.append('employmentStatus', employmentStatus);

      if (linkedInUrl.trim()) formData.append('linkedInUrl', linkedInUrl.trim());
      if (portfolioUrl.trim()) formData.append('portfolioUrl', portfolioUrl.trim());
      if (coverLetter.trim()) formData.append('coverLetter', coverLetter.trim());

      if (Object.keys(customAnswers).length > 0) {
        formData.append('customAnswers', JSON.stringify(customAnswers));
      }

      if (resumeFile) {
        formData.append('resume', resumeFile);
      }

      const res = await api.post(`/recruitment/public/jobs/${slug}/apply`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data?.success) {
        setSuccessData({
          applicationRef: res.data.applicationRef,
          jobTitle: res.data.jobTitle || job?.title || 'Position',
          candidateName: res.data.candidateName || fullName,
        });
      } else {
        setFormError(res.data?.error || 'Submission failed. Please try again.');
      }
    } catch (err: unknown) {
      console.error('Application submission error:', err);
      const responseError = err as { response?: { data?: { error?: string } } };
      setFormError(
        responseError.response?.data?.error || 'An error occurred while submitting your application. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingJob) {
    return <BrandLoader variant="fullscreen" size="md" bg="light" text="Loading application form..." />;
  }

  if (errorJob || !job) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl border border-gray-200 shadow-sm text-center max-w-md space-y-4">
          <AlertCircle size={40} className="text-red-500 mx-auto" />
          <h3 className="text-lg font-bold text-gray-900">{t('careers.noJobsTitle', 'Job Opening Not Available')}</h3>
          <p className="text-xs text-gray-500">{errorJob || 'This job is no longer accepting applications.'}</p>
          <Link
            href="/jobs"
            className="inline-block px-5 py-2.5 bg-amber-500 text-gray-950 font-bold text-xs rounded-xl hover:bg-amber-600 transition-all"
          >
            {t('careers.resetFilters', 'Explore Other Openings')}
          </Link>
        </div>
      </div>
    );
  }

  // Application Success Confirmation Screen
  if (successData) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
        <div className="max-w-lg w-full bg-white rounded-2xl border border-gray-200/80 p-6 sm:p-8 shadow-lg text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-500 ring-4 ring-emerald-50/50">
            <CheckCircle2 size={32} />
          </div>

          <div className="space-y-3">
            <span className="inline-block px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-semibold uppercase tracking-wider border border-amber-100">
              Application Submitted
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              {t('careers.successTitle', 'Thank You')}, {successData.candidateName}!
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed max-w-sm mx-auto">
              {t('careers.successSubtitle', 'Your application has been successfully received by our HR Team.')}
            </p>
          </div>

          <div className="bg-gray-50 border border-gray-100 p-4 sm:p-5 rounded-xl space-y-2 text-left shadow-inner">
            <span className="text-[11px] text-gray-500 uppercase font-medium tracking-wide block">Reference Number</span>
            <span className="text-base sm:text-lg font-mono font-semibold text-amber-600 select-all block">
              {successData.applicationRef}
            </span>
            <p className="text-xs text-gray-500 pt-2 border-t border-gray-200/60 mt-2">
              {t('careers.trackNotice', 'Please save this reference number for future inquiries regarding your application status.')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-4">
            <Link
              href="/jobs"
              className="flex-1 py-2.5 bg-gray-900 hover:bg-gray-800 text-white font-medium text-sm rounded-lg transition-all shadow-sm focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
            >
              {t('careers.backToJobs', 'Browse More Careers')}
            </Link>
            <Link
              href="/"
              className="flex-1 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium text-sm rounded-lg transition-all focus:ring-2 focus:ring-gray-200 focus:ring-offset-2"
            >
              {t('careers.backToOpenings', 'Return to Homepage')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Navigation Header */}
      <div className="bg-white border-b border-gray-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link
            href={`/jobs/${job.slug}`}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-gray-700 hover:text-amber-600 transition-colors"
          >
            <ChevronLeft size={18} />
            <span>{t('careers.backToOpenings', 'Back to Job Details')}</span>
          </Link>

          <span className="px-2.5 py-1 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold font-mono rounded-md">
            Ref: {job.jobCode}
          </span>
        </div>
      </div>

      {/* Form Container */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 sm:py-10 w-full flex-grow">
        <div className="bg-white rounded-3xl border border-gray-200/80 p-6 sm:p-10 shadow-sm space-y-8">
          {/* Header */}
          <div className="border-b border-gray-100 pb-6 space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 text-xs font-bold uppercase tracking-wider">
              <Building2 size={13} className="text-amber-600" />
              {job.department?.name}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900">
              {t('careers.applyHeader', 'Apply for')} {job.title}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 font-medium">
              {t('careers.applySubtitle', 'No account required. Fill out the application form below and upload your resume.')}
            </p>
          </div>

          {/* Form Error Banner */}
          {formError && (
            <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-xs sm:text-sm font-semibold flex items-center gap-2">
              <AlertCircle size={18} className="shrink-0 text-red-600" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Section 1: Personal Information */}
            <div className="space-y-4">
              <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                <User size={18} className="text-amber-500 shrink-0" />
                <span>1. {t('careers.personalDetails', 'Personal Details')}</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    {t('careers.fullName', 'Full Name')} <span className="text-amber-500 font-bold ml-0.5">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={t('careers.fullNamePlaceholder', 'e.g. Ramesh Sharma')}
                    value={fullName}
                    onChange={handleFullNameChange}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    {t('careers.emailAddress', 'Email Address')} <span className="text-amber-500 font-bold ml-0.5">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder={t('careers.emailPlaceholder', 'e.g. ramesh@example.com')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    {t('careers.mobileNumber', 'Mobile Number (10 Digits)')} <span className="text-amber-500 font-bold ml-0.5">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    maxLength={10}
                    placeholder={t('careers.mobilePlaceholder', 'e.g. 9876543210')}
                    value={mobile}
                    onChange={handleMobileChange}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    {t('careers.selectState', 'State')}
                  </label>
                  <CustomSelect
                    value={state}
                    onChange={(val) => handleStateSelect(val)}
                    onOpen={() => void fetchDbStates()}
                    placeholder={t('careers.selectState', 'Select State')}
                    searchable={true}
                    options={[
                      ...dbStates.map((s) => ({ value: s.name, label: s.name })),
                      ...(state && !dbStates.some((s) => s.name.toLowerCase() === state.toLowerCase())
                        ? [{ value: state, label: state }]
                        : []),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    {t('careers.currentCity', 'Current City')}
                  </label>
                  <CustomSelect
                    value={currentCity}
                    onChange={(val) => setCurrentCity(val)}
                    disabled={!state || loadingLocations}
                    placeholder={!state ? t('careers.selectState', 'Select State first...') : loadingLocations ? 'Loading cities...' : t('careers.selectCity', 'Select City')}
                    searchable={true}
                    options={[
                      ...dbCities.map((c) => ({ value: c.name, label: c.name })),
                      ...(currentCity && !dbCities.some((c) => c.name.toLowerCase() === currentCity.toLowerCase())
                        ? [{ value: currentCity, label: currentCity }]
                        : []),
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    Address / Area
                  </label>
                  <input
                    type="text"
                    placeholder="Street or Locality"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Section 2: Professional Information */}
            <div className="space-y-4 pt-6 border-t border-gray-100">
              <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                <Briefcase size={18} className="text-amber-500 shrink-0" />
                <span>2. Professional Experience &amp; Compensation</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    {t('careers.currentCompany', 'Current / Most Recent Company')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('careers.companyPlaceholder', 'e.g. Tata Motors / Self-Employed')}
                    value={currentCompany}
                    onChange={(e) => setCurrentCompany(e.target.value)}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    Current Designation
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Senior Sales Executive"
                    value={currentDesignation}
                    onChange={(e) => setCurrentDesignation(e.target.value)}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    {t('careers.experienceYears', 'Total Experience (Years)')}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="e.g. 4.5"
                    value={totalExperience}
                    onChange={(e) => setTotalExperience(e.target.value)}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    Relevant Experience (Years)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="e.g. 3.0"
                    value={relevantExperience}
                    onChange={(e) => setRelevantExperience(e.target.value)}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    Current Annual CTC (₹ Lakhs)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 6.5"
                    value={currentCtc}
                    onChange={(e) => setCurrentCtc(e.target.value)}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    Expected Annual CTC (₹ Lakhs)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    placeholder="e.g. 8.5"
                    value={expectedCtc}
                    onChange={(e) => setExpectedCtc(e.target.value)}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    {t('careers.noticePeriod', 'Notice Period')}
                  </label>
                  <CustomSelect
                    value={noticePeriod}
                    onChange={(val) => setNoticePeriod(val)}
                    options={[
                      { value: 'Immediate', label: 'Immediate / Serving Notice' },
                      { value: '15 Days', label: '15 Days' },
                      { value: '30 Days', label: '30 Days' },
                      { value: '60 Days', label: '60 Days' },
                      { value: '90 Days', label: '90 Days' },
                    ]}
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    Current Employment Status
                  </label>
                  <CustomSelect
                    value={employmentStatus}
                    onChange={(val) => setEmploymentStatus(val)}
                    options={[
                      { value: 'EMPLOYED', label: 'Employed' },
                      { value: 'UNEMPLOYED', label: 'Unemployed' },
                      { value: 'SERVING_NOTICE', label: 'Serving Notice Period' },
                      { value: 'FREELANCER', label: 'Freelancer' },
                      { value: 'STUDENT', label: 'Student' },
                    ]}
                  />
                </div>
              </div>
            </div>

            {/* Section 3: Professional Links & Cover Letter */}
            <div className="space-y-4 pt-6 border-t border-gray-100">
              <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                <Link2 size={18} className="text-amber-500 shrink-0" />
                <span>3. Online Profiles &amp; Cover Note</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    LinkedIn Profile URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://linkedin.com/in/username"
                    value={linkedInUrl}
                    onChange={(e) => setLinkedInUrl(e.target.value)}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                    Portfolio / Github / Work Sample URL
                  </label>
                  <input
                    type="url"
                    placeholder="https://portfolio.com"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl px-3.5 py-2.5 sm:py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-bold text-gray-800 mb-1.5">
                  {t('careers.coverLetter', 'Cover Letter / Brief Pitch')}
                </label>
                <textarea
                  rows={3}
                  placeholder={t('careers.uploadCoverLetter', 'Introduce yourself and briefly explain why you are a great fit for this role...')}
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  className="w-full bg-gray-50/80 border border-gray-200/90 rounded-xl p-3.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 hover:bg-white hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all resize-none"
                />
              </div>
            </div>

            {/* Section 4: Resume Upload */}
            <div className="space-y-4 pt-6 border-t border-gray-100">
              <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                <Upload size={18} className="text-amber-500 shrink-0" />
                <span>4. {t('careers.resumeDocument', 'Resume / CV Upload')}</span> {job.resumeRequired && <span className="text-amber-500 font-bold ml-1">*</span>}
              </h2>

              <div className="p-6 sm:p-8 border-2 border-dashed border-gray-200 hover:border-amber-400 rounded-2xl bg-amber-50/20 hover:bg-amber-50/40 text-center space-y-3 transition-all cursor-pointer relative">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />

                <div className="w-14 h-14 bg-amber-100/80 text-amber-700 rounded-2xl flex items-center justify-center mx-auto border border-amber-200/60 shadow-xs">
                  <FileText size={26} />
                </div>

                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {resumeFile ? resumeFile.name : t('careers.uploadResume', 'Click or Drag & Drop Resume File Here')}
                  </p>
                  <p className="text-xs text-gray-500 font-medium mt-1">
                    Supported formats: PDF, DOC, DOCX (Max size: 2MB for optimized storage)
                  </p>
                </div>

                {resumeFile && (
                  <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                    <CheckCircle2 size={14} />
                    {(resumeFile.size / (1024 * 1024)).toFixed(2)} MB Selected
                  </span>
                )}
              </div>

              {fileError && <p className="text-xs font-bold text-red-600">{fileError}</p>}
            </div>

            {/* Section 5: Admin Configured Dynamic Questions */}
            {job.customQuestions && job.customQuestions.length > 0 && (
              <div className="space-y-5 pt-6 border-t border-gray-100">
                <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-gray-900 flex items-center gap-2 border-b border-gray-100 pb-3">
                  <Sparkles size={18} className="text-amber-500 shrink-0" />
                  <span>5. {t('careers.customQuestions', 'Role-Specific Application Questions')}</span>
                </h2>

                <div className="space-y-4">
                  {job.customQuestions.map((q) => (
                    <div key={q.id} className="p-4 sm:p-5 bg-gray-50/80 rounded-2xl border border-gray-200/80 space-y-2.5">
                      <label className="block text-xs sm:text-sm font-bold text-gray-900">
                        {q.question} {q.isRequired && <span className="text-amber-500 font-bold ml-0.5">*</span>}
                      </label>

                      {/* SHORT_TEXT */}
                      {q.type === 'SHORT_TEXT' && (
                        <input
                          type="text"
                          required={q.isRequired}
                          value={customAnswers[q.id] || ''}
                          onChange={(e) => handleCustomAnswerChange(q.id, e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                        />
                      )}

                      {/* LONG_TEXT */}
                      {q.type === 'LONG_TEXT' && (
                        <textarea
                          rows={3}
                          required={q.isRequired}
                          value={customAnswers[q.id] || ''}
                          onChange={(e) => handleCustomAnswerChange(q.id, e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl p-3 text-sm font-medium text-gray-900 focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all resize-none"
                        />
                      )}

                      {/* NUMBER */}
                      {q.type === 'NUMBER' && (
                        <input
                          type="number"
                          required={q.isRequired}
                          value={customAnswers[q.id] || ''}
                          onChange={(e) => handleCustomAnswerChange(q.id, e.target.value)}
                          className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm font-medium text-gray-900 focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                        />
                      )}

                      {/* YES_NO */}
                      {q.type === 'YES_NO' && (
                        <div className="flex items-center gap-6 pt-1">
                          <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-800 cursor-pointer">
                            <input
                              type="radio"
                              name={`q_${q.id}`}
                              value="Yes"
                              checked={customAnswers[q.id] === 'Yes'}
                              onChange={(e) => handleCustomAnswerChange(q.id, e.target.value)}
                              className="text-amber-500 focus:ring-amber-500"
                            />
                            <span>Yes</span>
                          </label>

                          <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-800 cursor-pointer">
                            <input
                              type="radio"
                              name={`q_${q.id}`}
                              value="No"
                              checked={customAnswers[q.id] === 'No'}
                              onChange={(e) => handleCustomAnswerChange(q.id, e.target.value)}
                              className="text-amber-500 focus:ring-amber-500"
                            />
                            <span>No</span>
                          </label>
                        </div>
                      )}

                      {/* DROPDOWN */}
                      {q.type === 'DROPDOWN' && (
                        <CustomSelect
                          value={typeof customAnswers[q.id] === 'string' ? customAnswers[q.id] as string : ''}
                          onChange={(val) => handleCustomAnswerChange(q.id, val)}
                          placeholder="-- Select Option --"
                          options={q.options.map((opt) => ({ value: opt, label: opt }))}
                        />
                      )}

                      {/* SINGLE_CHOICE */}
                      {q.type === 'SINGLE_CHOICE' && (
                        <div className="space-y-2 pt-1">
                          {q.options.map((opt, i) => (
                            <label key={i} className="flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-800 cursor-pointer">
                              <input
                                type="radio"
                                name={`q_${q.id}`}
                                value={opt}
                                checked={customAnswers[q.id] === opt}
                                onChange={(e) => handleCustomAnswerChange(q.id, e.target.value)}
                                className="text-amber-500 focus:ring-amber-500"
                              />
                              <span>{opt}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      {/* MULTIPLE_CHOICE */}
                      {q.type === 'MULTIPLE_CHOICE' && (
                        <div className="space-y-2 pt-1">
                          {q.options.map((opt, i) => {
                            const currentList: string[] = Array.isArray(customAnswers[q.id]) ? customAnswers[q.id] as string[] : [];
                            return (
                              <label key={i} className="flex items-center gap-2 text-xs sm:text-sm font-bold text-gray-800 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={currentList.includes(opt)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      handleCustomAnswerChange(q.id, [...currentList, opt]);
                                    } else {
                                      handleCustomAnswerChange(
                                        q.id,
                                        currentList.filter((item) => item !== opt)
                                      );
                                    }
                                  }}
                                  className="rounded text-amber-500 focus:ring-amber-500"
                                />
                                <span>{opt}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Section 6: Consents & Submit */}
            <div className="space-y-5 pt-6 border-t border-gray-100">
              <div className="space-y-3">
                <label className="flex items-start gap-3 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={consentPrivacy}
                    onChange={(e) => setConsentPrivacy(e.target.checked)}
                    className="mt-0.5 rounded text-amber-500 focus:ring-amber-500 shrink-0"
                  />
                  <span>
                    I consent to the collection and processing of my personal data for recruitment purposes at JCB Exchange as per the Privacy Policy.
                  </span>
                </label>

                <label className="flex items-start gap-3 text-xs sm:text-sm font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    checked={confirmAccurate}
                    onChange={(e) => setConfirmAccurate(e.target.checked)}
                    className="mt-0.5 rounded text-amber-500 focus:ring-amber-500 shrink-0"
                  />
                  <span>
                    I confirm that all information provided in this application is accurate and truthful.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 sm:py-4 bg-[#FFC107] hover:bg-[#e5ad06] active:scale-[0.99] text-black font-extrabold text-sm sm:text-base rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                    <span>{t('careers.submitting', 'Submitting Application...')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('careers.submitApplication', 'Submit Application')}</span>
                    <Send size={18} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
