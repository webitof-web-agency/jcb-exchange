'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useEffect, useState, useDeferredValue, useMemo, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { canUseRecruitmentPermission, recruitmentPermissions } from '@/lib/recruitmentPermissions';
import BrandLoader from '@/components/ui/BrandLoader';
import { useTranslation } from '@/hooks/useTranslation';
import {
  Plus,
  Search,
  Briefcase,
  Eye,
  Edit,
  Copy,
  Trash2,
  X,
  PlusCircle,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  MoreVertical,
} from 'lucide-react';
import { buildPaginationItems } from '@/lib/paginationUtils';
import { generateRecruitmentJobDetailPath, getRecruitmentPortalBasePath } from '@/lib/routePaths';

interface JobDepartment {
  id: string;
  name: string;
  code: string;
}

interface StateOption {
  id: number;
  name: string;
  stateCode?: string;
}

interface CountryOption {
  id: number;
  name: string;
}

interface CityOption {
  id: number;
  name: string;
}

interface CustomQuestionInput {
  id?: string;
  question: string;
  type: 'SHORT_TEXT' | 'LONG_TEXT' | 'NUMBER' | 'YES_NO' | 'DROPDOWN' | 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE';
  options: string[];
  isRequired: boolean;
}

interface JobAdminItem {
  id: string;
  title: string;
  slug: string;
  jobCode: string;
  vacancies: number;
  employmentType: string;
  workMode: string;
  locationCity: string;
  locationState: string;
  locationAddress?: string | null;
  minExperience: number;
  maxExperience: number | null;
  minSalary: number | null;
  maxSalary: number | null;
  currency: string;
  salaryVisibility: boolean;
  educationRequirement?: string | null;
  summary?: string | null;
  description: string;
  responsibilities: string[];
  requirements: string[];
  preferredSkills: string[];
  benefits: string[];
  workingHours?: string | null;
  aboutCompany?: string | null;
  startDate?: string | null;
  deadline?: string | null;
  resumeRequired: boolean;
  coverLetterRequired: boolean;
  seoTitle?: string | null;
  metaDescription?: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'CLOSED' | 'ARCHIVED';
  postedAt?: string | null;
  department: JobDepartment;
  customQuestions?: CustomQuestionInput[];
  _count?: {
    applications: number;
  };
}

interface CustomSelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  onOpen?: () => void;
  placeholder?: string;
  disabled?: boolean;
  searchable?: boolean;
  className?: string;
  dropUp?: boolean;
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
  dropUp = false,
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
        className={`flex w-full items-center justify-between rounded-xl border border-gray-200 bg-gray-50/90 px-3.5 py-2.5 text-xs font-medium text-gray-900 shadow-2xs transition-all hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none ${
          disabled ? 'cursor-not-allowed bg-gray-100 opacity-60 text-gray-400 border-gray-200' : 'cursor-pointer'
        }`}
      >
        <span className={`truncate ${!selectedOption ? 'text-gray-400 font-normal' : 'text-gray-900 font-medium'}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className={`ml-2 h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-gray-600' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className={`absolute left-0 z-50 min-w-full w-max max-w-xs max-h-60 overflow-y-auto rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] ${
          dropUp ? 'bottom-full mb-1 origin-bottom-left' : 'top-full mt-1 origin-top-left'
        }`}>
          {searchable && options.length > 5 && (
            <div className="sticky top-0 z-10 bg-white pb-1.5 pt-0.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full rounded-lg bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 placeholder:text-gray-400 outline-none focus:bg-gray-100 focus:ring-1 focus:ring-[#FFC107]"
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
                    className={`flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-xs font-medium transition-colors gap-2 ${
                      isSelected
                        ? 'bg-[#FFC107]/15 font-semibold text-amber-900 hover:bg-[#FFC107]/25'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    <span className="whitespace-nowrap">{opt.label}</span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-amber-800" />}
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

export default function AdminJobsPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const canRead = canUseRecruitmentPermission(currentUser, recruitmentPermissions.jobsRead);
  const canCreate = canUseRecruitmentPermission(currentUser, recruitmentPermissions.jobsCreate);
  const canUpdate = canUseRecruitmentPermission(currentUser, recruitmentPermissions.jobsUpdate);
  const canDelete = canUseRecruitmentPermission(currentUser, recruitmentPermissions.jobsDelete);
  const canDuplicate = canUseRecruitmentPermission(currentUser, recruitmentPermissions.jobsDuplicate);
  const canChangeStatus = canUseRecruitmentPermission(currentUser, recruitmentPermissions.jobsChangeStatus);
  const router = useRouter();
  const pathname = usePathname();
  const recruitmentBasePath = getRecruitmentPortalBasePath(pathname);
  const [jobs, setJobs] = useState<JobAdminItem[]>([]);
  const [departments, setDepartments] = useState<JobDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = useDeferredValue(searchTerm);

  // Drawer / Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [openActionDropdownId, setOpenActionDropdownId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(10);
  const [openPageSizeDropdown, setOpenPageSizeDropdown] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      const target = event.target as HTMLElement;
      if (!target?.closest?.('.job-action-dropdown-container')) {
        setOpenActionDropdownId(null);
      }
      if (!target?.closest?.('.rows-per-page-dropdown-container')) {
        setOpenPageSizeDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // DB Location States & Cities
  const [dbStates, setDbStates] = useState<StateOption[]>([]);
  const [dbCities, setDbCities] = useState<CityOption[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);

  // Form Fields State
  const [formTitle, setFormTitle] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formJobCode, setFormJobCode] = useState('');
  const [formDepartmentId, setFormDepartmentId] = useState('');
  const [formVacancies, setFormVacancies] = useState('1');
  const [formEmploymentType, setFormEmploymentType] = useState('FULL_TIME');
  const [formWorkMode, setFormWorkMode] = useState('ON_SITE');
  const [formLocationCity, setFormLocationCity] = useState('');
  const [formLocationState, setFormLocationState] = useState('');
  const [formLocationAddress, setFormLocationAddress] = useState('');
  const [formMinExp, setFormMinExp] = useState('0');
  const [formMaxExp, setFormMaxExp] = useState('');
  const [formMinSalary, setFormMinSalary] = useState('');
  const [formMaxSalary, setFormMaxSalary] = useState('');
  const [formCurrency, setFormCurrency] = useState('INR');
  const [formSalaryVisibility, setFormSalaryVisibility] = useState(true);
  const [formEducation, setFormEducation] = useState('');
  const [formSummary, setFormSummary] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formResponsibilities, setFormResponsibilities] = useState('');
  const [formRequirements, setFormRequirements] = useState('');
  const [formPreferredSkills, setFormPreferredSkills] = useState('');
  const [formBenefits, setFormBenefits] = useState('');
  const [formWorkingHours, setFormWorkingHours] = useState('');
  const [formAboutCompany, setFormAboutCompany] = useState('');
  const [formDeadline, setFormDeadline] = useState('');
  const [formResumeRequired, setFormResumeRequired] = useState(true);
  const [formCoverLetterRequired, setFormCoverLetterRequired] = useState(false);
  const [formSeoTitle, setFormSeoTitle] = useState('');
  const [formMetaDescription, setFormMetaDescription] = useState('');
  const [formStatus, setFormStatus] = useState<'DRAFT' | 'PUBLISHED' | 'PAUSED' | 'CLOSED' | 'ARCHIVED'>('DRAFT');

  const [customQuestions, setCustomQuestions] = useState<CustomQuestionInput[]>([]);

  const fetchDepartments = async (forceRefresh = false) => {
    if (!forceRefresh && departments.length > 0) return departments;

    try {
      const res = await api.get('/recruitment/admin/departments');
      if (res.data?.success && Array.isArray(res.data.departments)) {
        const latestDepartments = res.data.departments as JobDepartment[];
        setDepartments(latestDepartments);
        setFormDepartmentId((current) => {
          if (!latestDepartments.length) return '';
          return current && latestDepartments.some((department) => department.id === current)
            ? current
            : latestDepartments[0].id;
        });
        return latestDepartments;
      }
    } catch (err) {
      console.error('Failed to load departments:', err);
    }
    return departments;
  };

  const fetchDbStates = async (): Promise<StateOption[]> => {
    if (dbStates.length > 0) return dbStates;
    try {
      const countriesRes = await api.get('/locations/countries');
      const countries = (countriesRes.data || []) as CountryOption[];
      const india = countries.find((c) => c.name?.toLowerCase() === 'india') || countries[0];
      if (india?.id) {
        const statesRes = await api.get(`/locations/states/${india.id}`);
        const statesList = statesRes.data || [];
        setDbStates(statesList);
        return statesList;
      }
    } catch (err) {
      console.error('Failed to load location states from DB:', err);
    }
    return [];
  };

  const handleStateSelect = async (stateName: string) => {
    setFormLocationState(stateName);
    setFormLocationCity('');
    setDbCities([]);

    if (!stateName) return;

    const currentStates = dbStates.length > 0 ? dbStates : await fetchDbStates();
    const matchedState = currentStates.find((s) => s.name.toLowerCase() === stateName.toLowerCase());

    if (matchedState?.id) {
      try {
        setLoadingLocations(true);
        const citiesRes = await api.get(`/locations/cities/${matchedState.id}`);
        const cityList = citiesRes.data || [];
        setDbCities(cityList);
      } catch (err) {
        console.error('Failed to load location cities from DB:', err);
      } finally {
        setLoadingLocations(false);
      }
    }
  };

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, string> = {};
      if (searchTerm.trim()) params.q = searchTerm.trim();

      const jobsRes = await api.get('/recruitment/admin/jobs', { params });

      if (jobsRes.data?.success) {
        setJobs(jobsRes.data.jobs || []);
        if (jobsRes.data.departments) {
          setDepartments(jobsRes.data.departments);
        }
      }
    } catch (err: unknown) {
      console.error('Failed to load admin jobs:', err);
      setError('Unable to load job listings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenCreateModal = () => {
    setEditingJobId(null);
    setFormTitle('');
    setFormSlug('');
    setFormJobCode('');
    setFormDepartmentId(departments[0]?.id || '');
    setFormVacancies('1');
    setFormEmploymentType('FULL_TIME');
    setFormWorkMode('ON_SITE');
    setFormLocationAddress('');
    setFormMinExp('0');
    setFormMaxExp('');
    setFormMinSalary('');
    setFormMaxSalary('');
    setFormCurrency('INR');
    setFormSalaryVisibility(true);
    setFormEducation('');
    setFormSummary('');
    setFormDescription('');
    setFormResponsibilities('');
    setFormRequirements('');
    setFormPreferredSkills('');
    setFormBenefits('');
    setFormWorkingHours('');
    setFormAboutCompany('');
    setFormDeadline('');
    setFormResumeRequired(true);
    setFormCoverLetterRequired(false);
    setFormSeoTitle('');
    setFormMetaDescription('');
    setFormStatus('PUBLISHED');
    setCustomQuestions([]);

    setFormLocationState('');
    setFormLocationCity('');
    setDbCities([]);

    setIsModalOpen(true);
    void fetchDepartments(true);
  };

  const handleOpenEditModal = async (jobId: string) => {
    try {
      setEditingJobId(jobId);
      const res = await api.get(`/recruitment/admin/jobs/${jobId}`);

      if (res.data?.success && res.data.job) {
        const j = res.data.job;
        setFormTitle(j.title || '');
        setFormSlug(j.slug || '');
        setFormJobCode(j.jobCode || '');
        setFormDepartmentId(j.departmentId || '');
        setFormVacancies(j.vacancies?.toString() || '1');
        setFormEmploymentType(j.employmentType || 'FULL_TIME');
        setFormWorkMode(j.workMode || 'ON_SITE');
        setFormLocationCity(j.locationCity || '');
        setFormLocationState(j.locationState || '');
        setFormLocationAddress(j.locationAddress || '');
        setFormMinExp(j.minExperience?.toString() || '0');
        setFormMaxExp(j.maxExperience?.toString() || '');
        setFormMinSalary(j.minSalary?.toString() || '');
        setFormMaxSalary(j.maxSalary?.toString() || '');
        setFormCurrency(j.currency || 'INR');
        setFormSalaryVisibility(j.salaryVisibility !== false);
        setFormEducation(j.educationRequirement || '');
        setFormSummary(j.summary || '');
        setFormDescription(j.description || '');
        setFormResponsibilities(Array.isArray(j.responsibilities) ? j.responsibilities.join('\n') : '');
        setFormRequirements(Array.isArray(j.requirements) ? j.requirements.join('\n') : '');
        setFormPreferredSkills(Array.isArray(j.preferredSkills) ? j.preferredSkills.join('\n') : '');
        setFormBenefits(Array.isArray(j.benefits) ? j.benefits.join('\n') : '');
        setFormWorkingHours(j.workingHours || '');
        setFormAboutCompany(j.aboutCompany || '');
        setFormDeadline(j.deadline ? new Date(j.deadline).toISOString().split('T')[0] : '');
        setFormResumeRequired(j.resumeRequired !== false);
        setFormCoverLetterRequired(!!j.coverLetterRequired);
        setFormSeoTitle(j.seoTitle || '');
        setFormMetaDescription(j.metaDescription || '');
        setFormStatus(j.status || 'DRAFT');
        setCustomQuestions(j.customQuestions || []);
        setIsModalOpen(true);

        if (j.locationState) {
          void fetchDbStates().then(async (loadedStates) => {
            const matchedState = loadedStates.find((s) => s.name.toLowerCase() === j.locationState.toLowerCase());
            if (matchedState?.id) {
              try {
                setLoadingLocations(true);
                const citiesRes = await api.get(`/locations/cities/${matchedState.id}`);
                setDbCities(citiesRes.data || []);
              } catch (err) {
                console.error('Failed to load cities for edit job:', err);
              } finally {
                setLoadingLocations(false);
              }
            }
          });
        }
      }
      } catch {
        alert('Failed to load job details for editing.');
    }
  };

  const handleDuplicateJob = async (jobId: string) => {
    if (!canDuplicate) return;
    if (confirm('Duplicate this job posting as a new draft?')) {
      try {
        const res = await api.post(`/recruitment/admin/jobs/${jobId}/duplicate`);
        if (res.data?.success) {
          fetchJobs();
        }
      } catch {
        alert('Failed to duplicate job.');
      }
    }
  };

  const handleStatusChange = async (jobId: string, status: string) => {
    if (!canChangeStatus) return;
    try {
      const res = await api.patch(`/recruitment/admin/jobs/${jobId}/status`, { status });
      if (res.data?.success) {
        fetchJobs();
      }
    } catch {
      alert('Failed to update job status.');
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!canDelete) return;
    if (confirm('Are you sure you want to delete this job posting? This action cannot be undone.')) {
      try {
        const res = await api.delete(`/recruitment/admin/jobs/${jobId}`);
        if (res.data?.success) {
          fetchJobs();
        }
      } catch {
        alert('Failed to delete job posting.');
      }
    }
  };

  const handleAddQuestion = () => {
    setCustomQuestions((prev) => [
      ...prev,
      {
        question: '',
        type: 'SHORT_TEXT',
        options: [],
        isRequired: false,
      },
    ]);
  };

  const handleRemoveQuestion = (index: number) => {
    setCustomQuestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleQuestionChange = (
    index: number,
    field: keyof CustomQuestionInput,
    value: CustomQuestionInput[keyof CustomQuestionInput]
  ) => {
    setCustomQuestions((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleSaveJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() || !formDepartmentId || !formDescription.trim() || !formLocationState || !formLocationCity) {
      alert('Title, department, location state, location city, and description are required.');
      return;
    }

    try {
      setSaving(true);
      const payload = {
        title: formTitle.trim(),
        slug: formSlug.trim() || undefined,
        jobCode: formJobCode.trim() || undefined,
        departmentId: formDepartmentId,
        vacancies: formVacancies ? parseInt(formVacancies, 10) : 1,
        employmentType: formEmploymentType,
        workMode: formWorkMode,
        locationCity: formLocationCity.trim(),
        locationState: formLocationState.trim(),
        locationAddress: formLocationAddress.trim() || undefined,
        minExperience: formMinExp ? parseFloat(formMinExp) : 0,
        maxExperience: formMaxExp ? parseFloat(formMaxExp) : null,
        minSalary: formMinSalary ? parseFloat(formMinSalary) : null,
        maxSalary: formMaxSalary ? parseFloat(formMaxSalary) : null,
        currency: formCurrency,
        salaryVisibility: formSalaryVisibility,
        educationRequirement: formEducation.trim() || undefined,
        summary: formSummary.trim() || undefined,
        description: formDescription.trim(),
        responsibilities: formResponsibilities.split('\n').filter((s) => s.trim()),
        requirements: formRequirements.split('\n').filter((s) => s.trim()),
        preferredSkills: formPreferredSkills.split('\n').filter((s) => s.trim()),
        benefits: formBenefits.split('\n').filter((s) => s.trim()),
        workingHours: formWorkingHours.trim() || undefined,
        aboutCompany: formAboutCompany.trim() || undefined,
        deadline: formDeadline ? formDeadline : null,
        resumeRequired: formResumeRequired,
        coverLetterRequired: formCoverLetterRequired,
        seoTitle: formSeoTitle.trim() || undefined,
        metaDescription: formMetaDescription.trim() || undefined,
        status: formStatus,
        customQuestions,
      };

      if (editingJobId) {
        await api.put(`/recruitment/admin/jobs/${editingJobId}`, payload);
      } else {
        await api.post('/recruitment/admin/jobs', payload);
      }

      setIsModalOpen(false);
      fetchJobs();
    } catch (err: unknown) {
      const message = typeof err === 'object' && err !== null && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null;
      alert(message || 'Failed to save job posting.');
    } finally {
      setSaving(false);
    }
  };

  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, pageSize]);

  const filteredJobsList = useMemo(() => {
    return jobs.filter((job) => {
      const q = deferredSearchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        job.title.toLowerCase().includes(q) ||
        job.jobCode.toLowerCase().includes(q) ||
        job.locationCity.toLowerCase().includes(q);
      return matchesSearch;
    });
  }, [deferredSearchTerm, jobs]);

  const totalPages = Math.ceil(filteredJobsList.length / pageSize) || 1;
  const paginatedJobs = useMemo(
    () => filteredJobsList.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredJobsList, pageSize]
  );
  const startItemIndex = filteredJobsList.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const endItemIndex = Math.min(currentPage * pageSize, filteredJobsList.length);

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <main className="max-w-7xl mx-auto px-0 pt-0 pb-6 w-full space-y-4 flex-grow">
        {/* Filter & Action Bar */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto flex-1">
            <div className="relative flex items-center w-full sm:w-72">
              <Search size={16} className="absolute left-3 text-gray-400" />
              <input
                type="text"
                placeholder={t('recruitment.searchJobsings', 'Search title, code, location...')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchJobs()}
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#FFC107] hover:bg-gray-100/70 transition-all font-medium"
              />
            </div>

          </div>

          {canCreate ? (
            <button
              onClick={handleOpenCreateModal}
              className="px-4 py-2.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-semibold text-xs rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 shrink-0 w-full md:w-auto"
            >
              <Plus size={16} />
              <span>{t('recruitment.createNewJob', 'Create New Job')}</span>
            </button>
          ) : null}
        </div>

        {error ? (
          <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        {/* Jobs Table Container */}
        {loading ? (
          <BrandLoader variant="section" size="md" bg="light" text={t('recruitment.loadingJobs', 'Loading Job Listings...')} className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm" />
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto min-h-[260px] overflow-y-visible [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-[10px] uppercase font-bold text-gray-400">
                  <th className="py-3 px-4">{t('recruitment.jobTitleCode', 'Job Title & Code')}</th>
                  <th className="py-3 px-4">{t('recruitment.department', 'Department')}</th>
                  <th className="py-3 px-4">{t('recruitment.location', 'Location')}</th>
                  <th className="py-3 px-4">{t('recruitment.typeMode', 'Type / Mode')}</th>
                  <th className="py-3 px-4">{t('recruitment.vacancies', 'Vacancies')}</th>
                  <th className="py-3 px-4">{t('recruitment.applicationsCount', 'Applications')}</th>
                  <th className="py-3 px-4">{t('recruitment.status', 'Status')}</th>
                  <th className="py-3 px-4 text-right">{t('recruitment.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {paginatedJobs.map((job, idx) => {
                  const isNearBottom = paginatedJobs.length > 3 && idx >= paginatedJobs.length - 2;
                  return (
                    <tr
                      key={job.id}
                      onClick={() => router.push(generateRecruitmentJobDetailPath(recruitmentBasePath, job))}
                      className="hover:bg-amber-50/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-gray-900 block">{job.title}</span>
                        <span className="text-[10px] text-gray-400 font-mono">Ref: {job.jobCode}</span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-gray-700">
                        {job.department?.name}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600">
                        {job.locationCity}, {job.locationState}
                      </td>
                      <td className="py-3.5 px-4 text-gray-600">
                        {job.employmentType} ({job.workMode})
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-gray-900">
                        {job.vacancies}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-amber-600">
                        {job._count?.applications || 0}
                      </td>
                      <td className="py-3.5 px-4">
                        {canChangeStatus ? (
                          <div className="w-32" onClick={(event) => event.stopPropagation()}>
                            <CustomSelect
                              value={job.status}
                              onChange={(status) => void handleStatusChange(job.id, status)}
                              dropUp={isNearBottom}
                              options={[
                                { value: 'DRAFT', label: t('recruitment.draft', 'Draft') },
                                { value: 'PUBLISHED', label: t('recruitment.published', 'Published') },
                                { value: 'PAUSED', label: t('recruitment.paused', 'Paused') },
                                { value: 'CLOSED', label: t('recruitment.closed', 'Closed') },
                                { value: 'ARCHIVED', label: t('recruitment.archived', 'Archived') },
                              ]}
                            />
                          </div>
                        ) : (
                          <span
                            className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                              job.status === 'PUBLISHED'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                : job.status === 'DRAFT'
                                ? 'bg-gray-100 text-gray-700 border-gray-200'
                                : job.status === 'PAUSED'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            {job.status}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block text-left job-action-dropdown-container">
                          <button
                            type="button"
                            onClick={() => setOpenActionDropdownId((prev) => (prev === job.id ? null : job.id))}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                          >
                            <MoreVertical size={16} />
                          </button>

                          {openActionDropdownId === job.id && (
                            <div className={`absolute right-0 z-[100] w-40 rounded-xl border border-gray-200 bg-white p-1.5 shadow-2xl ring-1 ring-black/5 ${
                              isNearBottom ? 'bottom-full mb-1 origin-bottom-right' : 'top-full mt-1 origin-top-right'
                            }`}>
                              {canRead ? <button
                                type="button"
                                onClick={() => {
                                  setOpenActionDropdownId(null);
                                  router.push(generateRecruitmentJobDetailPath(recruitmentBasePath, job));
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                              >
                                <Eye size={14} className="text-gray-400" />
                                <span>{t('recruitment.viewJob', 'View Details')}</span>
                              </button> : null}

                              {canUpdate ? <button
                                type="button"
                                onClick={() => {
                                  setOpenActionDropdownId(null);
                                  handleOpenEditModal(job.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                              >
                                <Edit size={14} className="text-gray-400" />
                                <span>{t('recruitment.editJob', 'Edit Job')}</span>
                              </button> : null}

                              {canDuplicate ? <button
                                type="button"
                                onClick={() => {
                                  setOpenActionDropdownId(null);
                                  void handleDuplicateJob(job.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900"
                              >
                                <Copy size={14} className="text-gray-400" />
                                <span>{t('recruitment.duplicateJob', 'Duplicate Job')}</span>
                              </button> : null}

                              {(canDelete || canDuplicate) ? <div className="my-1 border-t border-gray-100" /> : null}

                              {canDelete ? <button
                                type="button"
                                onClick={() => {
                                  setOpenActionDropdownId(null);
                                  handleDeleteJob(job.id);
                                }}
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                              >
                                <Trash2 size={14} className="text-red-500" />
                                <span>Delete Job</span>
                              </button> : null}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {!loading && filteredJobsList.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-xs text-gray-400">
                      No jobs found matching active filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer - Matches Listings Module */}
          {filteredJobsList.length > 0 && (
            <div className="flex flex-col gap-4 border-t border-gray-100 bg-white px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-gray-500 sm:justify-start">
                <div>
                  Showing <span className="font-bold text-gray-900">{startItemIndex}</span> to{' '}
                  <span className="font-bold text-gray-900">{endItemIndex}</span> of{' '}
                  <span className="font-bold text-gray-900">{filteredJobsList.length}</span> entries
                </div>

                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <div className="relative rows-per-page-dropdown-container">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setOpenPageSizeDropdown((prev) => !prev);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-bold text-gray-800 shadow-2xs transition hover:bg-gray-50 focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    >
                      <span>{pageSize}</span>
                      <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                    </button>

                    {openPageSizeDropdown && (
                      <div className="absolute bottom-full left-0 z-50 mb-1.5 w-20 origin-bottom-left rounded-xl border border-gray-100 bg-white p-1 shadow-lg">
                        {[5, 10, 25, 50].map((size) => (
                          <button
                            key={size}
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setPageSize(size);
                              setCurrentPage(1);
                              setOpenPageSizeDropdown(false);
                            }}
                            className={`block w-full rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-gray-100 ${
                              pageSize === size ? 'bg-[#FFC107]/20 font-extrabold text-gray-900' : 'font-medium text-gray-700'
                            }`}
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-1 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:inline">Previous</span>
                </button>

                <div className="flex items-center gap-1 px-1">
                  {buildPaginationItems(currentPage, totalPages).map((item, idx) =>
                    typeof item === 'number' ? (
                      <button
                        key={item}
                        type="button"
                        onClick={() => setCurrentPage(item)}
                        className={`h-8 w-8 rounded-lg text-xs font-bold transition ${
                          currentPage === item ? 'bg-[#FFC107] text-black shadow-2xs' : 'text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        {item}
                      </button>
                    ) : (
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs font-bold text-gray-400">
                        ...
                      </span>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages || totalPages === 1}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </main>

      {/* Create / Edit Job Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-950/60 backdrop-blur-sm overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-gray-200 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between z-20">
              <div>
                <h3 className="text-base font-bold text-gray-900">
                  {editingJobId ? 'Edit Job Posting' : 'Create New Job Posting'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">Fill in job details, requirements, and publication settings</p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveJob} className="p-6 space-y-6 text-xs">
              {/* General Information */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                  <Briefcase size={14} />
                  1. General Information
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Job Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Senior Sales Executive"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      className="w-full bg-gray-50/90 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-900 placeholder:text-gray-400 hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Department *</label>
                    <CustomSelect
                      value={formDepartmentId}
                      onChange={(val) => setFormDepartmentId(val)}
                      onOpen={() => {
                        void fetchDepartments(true).then((latestDepts) => {
                          if (latestDepts[0]?.id) {
                            setFormDepartmentId((current) => current || latestDepts[0].id);
                          }
                        });
                      }}
                      placeholder="Select Department"
                      searchable={true}
                      options={departments.map((d) => ({ value: d.id, label: d.name }))}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Vacancies</label>
                    <input
                      type="number"
                      min="1"
                      value={formVacancies}
                      onChange={(e) => setFormVacancies(e.target.value)}
                      className="w-full bg-gray-50/90 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-900 placeholder:text-gray-400 hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Employment Type</label>
                    <CustomSelect
                      value={formEmploymentType}
                      onChange={(val) => setFormEmploymentType(val)}
                      options={[
                        { value: 'FULL_TIME', label: 'Full Time' },
                        { value: 'PART_TIME', label: 'Part Time' },
                        { value: 'CONTRACT', label: 'Contract' },
                        { value: 'INTERNSHIP', label: 'Internship' },
                        { value: 'FREELANCE', label: 'Freelance' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Work Mode</label>
                    <CustomSelect
                      value={formWorkMode}
                      onChange={(val) => setFormWorkMode(val)}
                      options={[
                        { value: 'ON_SITE', label: 'On-site' },
                        { value: 'REMOTE', label: 'Remote' },
                        { value: 'HYBRID', label: 'Hybrid' },
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Location State *</label>
                    <CustomSelect
                      value={formLocationState}
                      onChange={(val) => handleStateSelect(val)}
                      onOpen={() => {
                        void fetchDbStates();
                      }}
                      placeholder="Select State"
                      searchable={true}
                      options={[
                        ...dbStates.map((s) => ({ value: s.name, label: s.name })),
                        ...(formLocationState && !dbStates.some((s) => s.name.toLowerCase() === formLocationState.toLowerCase())
                          ? [{ value: formLocationState, label: formLocationState }]
                          : []),
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Location City *</label>
                    <CustomSelect
                      value={formLocationCity}
                      onChange={(val) => setFormLocationCity(val)}
                      disabled={!formLocationState || loadingLocations}
                      placeholder={
                        !formLocationState
                          ? 'Select State first...'
                          : loadingLocations
                          ? 'Loading cities...'
                          : 'Select City'
                      }
                      searchable={true}
                      options={[
                        ...dbCities.map((c) => ({ value: c.name, label: c.name })),
                        ...(formLocationCity && !dbCities.some((c) => c.name.toLowerCase() === formLocationCity.toLowerCase())
                          ? [{ value: formLocationCity, label: formLocationCity }]
                          : []),
                      ]}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Min Experience (Yrs)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={formMinExp}
                      onChange={(e) => setFormMinExp(e.target.value)}
                      className="w-full bg-gray-50/90 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-900 placeholder:text-gray-400 hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Max Experience (Yrs)</label>
                    <input
                      type="number"
                      step="0.5"
                      placeholder="e.g. 5"
                      value={formMaxExp}
                      onChange={(e) => setFormMaxExp(e.target.value)}
                      className="w-full bg-gray-50/90 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-900 placeholder:text-gray-400 hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Min Salary (₹/Yr)</label>
                    <input
                      type="number"
                      placeholder="e.g. 600000"
                      value={formMinSalary}
                      onChange={(e) => setFormMinSalary(e.target.value)}
                      className="w-full bg-gray-50/90 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-900 placeholder:text-gray-400 hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Max Salary (₹/Yr)</label>
                    <input
                      type="number"
                      placeholder="e.g. 1000000"
                      value={formMaxSalary}
                      onChange={(e) => setFormMaxSalary(e.target.value)}
                      className="w-full bg-gray-50/90 border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium text-gray-900 placeholder:text-gray-400 hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-6 pt-2">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700 text-xs">
                    <input
                      type="checkbox"
                      checked={formSalaryVisibility}
                      onChange={(e) => setFormSalaryVisibility(e.target.checked)}
                      className="rounded text-[#FFC107] focus:ring-[#FFC107]"
                    />
                    <span>Display Salary Publicly</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700 text-xs">
                    <input
                      type="checkbox"
                      checked={formResumeRequired}
                      onChange={(e) => setFormResumeRequired(e.target.checked)}
                      className="rounded text-[#FFC107] focus:ring-[#FFC107]"
                    />
                    <span>Require Resume</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-700 text-xs">
                    <input
                      type="checkbox"
                      checked={formCoverLetterRequired}
                      onChange={(e) => setFormCoverLetterRequired(e.target.checked)}
                      className="rounded text-[#FFC107] focus:ring-[#FFC107]"
                    />
                    <span>Require Cover Letter</span>
                  </label>
                </div>
              </div>

              {/* Job Content */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h4 className="text-xs font-bold text-amber-800">
                  2. Content &amp; Descriptions
                </h4>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Short Summary</label>
                  <textarea
                    rows={2}
                    placeholder="Brief 1-2 sentence pitch..."
                    value={formSummary}
                    onChange={(e) => setFormSummary(e.target.value)}
                    className="w-full bg-gray-50/90 border border-gray-200 rounded-xl p-3 text-xs font-medium text-gray-900 placeholder:text-gray-400 hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Full Description *</label>
                  <textarea
                    rows={5}
                    required
                    placeholder="Detailed job description..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full bg-gray-50/90 border border-gray-200 rounded-xl p-3 text-xs font-medium text-gray-900 placeholder:text-gray-400 hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Responsibilities (One per line)</label>
                    <textarea
                      rows={4}
                      placeholder="Lead sales team&#10;Drive monthly target..."
                      value={formResponsibilities}
                      onChange={(e) => setFormResponsibilities(e.target.value)}
                      className="w-full bg-gray-50/90 border border-gray-200 rounded-xl p-3 text-xs font-medium text-gray-900 placeholder:text-gray-400 hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1.5">Requirements (One per line)</label>
                    <textarea
                      rows={4}
                      placeholder="3+ years commercial vehicle sales&#10;Good communication..."
                      value={formRequirements}
                      onChange={(e) => setFormRequirements(e.target.value)}
                      className="w-full bg-gray-50/90 border border-gray-200 rounded-xl p-3 text-xs font-medium text-gray-900 placeholder:text-gray-400 hover:bg-gray-100 hover:border-gray-300 focus:bg-white focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 outline-none transition-all"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Custom Questions Builder */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <Sparkles size={14} />
                    3. Custom Application Questions Builder
                  </h4>

                  <button
                    type="button"
                    onClick={handleAddQuestion}
                    className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded-lg text-xs flex items-center gap-1 transition-colors"
                  >
                    <PlusCircle size={14} />
                    <span>Add Question</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {customQuestions.map((q, idx) => (
                    <div key={idx} className="p-3.5 bg-gray-50/90 rounded-2xl border border-gray-200 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          placeholder="e.g. Do you have a valid driving license?"
                          value={q.question}
                          onChange={(e) => handleQuestionChange(idx, 'question', e.target.value)}
                          className="flex-1 bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-900 focus:border-[#FFC107] outline-none"
                        />

                        <CustomSelect
                          className="w-40"
                          value={q.type}
                          onChange={(val) => handleQuestionChange(idx, 'type', val)}
                          options={[
                            { value: 'SHORT_TEXT', label: 'Short Text' },
                            { value: 'LONG_TEXT', label: 'Long Text' },
                            { value: 'NUMBER', label: 'Number' },
                            { value: 'YES_NO', label: 'Yes / No' },
                            { value: 'DROPDOWN', label: 'Dropdown' },
                            { value: 'SINGLE_CHOICE', label: 'Single Choice' },
                            { value: 'MULTIPLE_CHOICE', label: 'Multiple Choice' },
                          ]}
                        />

                        <label className="flex items-center gap-1 text-xs font-medium text-gray-700 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={q.isRequired}
                            onChange={(e) => handleQuestionChange(idx, 'isRequired', e.target.checked)}
                            className="rounded text-[#FFC107]"
                          />
                          <span>Required</span>
                        </label>

                        <button
                          type="button"
                          onClick={() => handleRemoveQuestion(idx)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {['DROPDOWN', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(q.type) && (
                        <input
                          type="text"
                          placeholder="Comma separated options (e.g. Option A, Option B, Option C)"
                          value={q.options?.join(', ') || ''}
                          onChange={(e) =>
                            handleQuestionChange(
                              idx,
                              'options',
                              e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
                            )
                          }
                          className="w-full bg-white border border-gray-200 rounded-xl px-3 py-1.5 text-xs text-gray-800 focus:border-[#FFC107] outline-none"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Status & Submit */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700 text-xs">Status:</span>
                  {canChangeStatus ? (
                    <CustomSelect
                      className="w-36"
                      dropUp={true}
                      value={formStatus}
                      onChange={(val) => setFormStatus(val as JobAdminItem['status'])}
                      options={[
                        { value: 'DRAFT', label: 'Draft' },
                        { value: 'PUBLISHED', label: 'Published' },
                        { value: 'PAUSED', label: 'Paused' },
                        { value: 'CLOSED', label: 'Closed' },
                        { value: 'ARCHIVED', label: 'Archived' },
                      ]}
                    />
                  ) : <span className="text-xs font-semibold text-gray-600">{formStatus}</span>}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-xs transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || (editingJobId ? !canUpdate : !canCreate)}
                    className="px-6 py-2.5 bg-[#FFC107] hover:bg-[#e5ad06] text-black font-semibold rounded-xl text-xs shadow-sm transition-all disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : editingJobId ? 'Update Job' : 'Publish Job'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
