/* eslint-disable react-hooks/set-state-in-effect */

'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Briefcase,
  MapPin,
  Clock,
  Building2,
  Search,
  Filter,
  Users,
  Calendar,
  ChevronRight,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

interface JobDepartment {
  id: string;
  name: string;
  code: string;
}

interface JobFilterOptions {
  departments: JobDepartment[];
  employmentTypes: string[];
  workModes: string[];
  experienceLevels: string[];
}

interface FilterSelectProps {
  label: string;
  value: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}

function FilterSelect({ label, value, placeholder, options, onChange }: FilterSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between rounded-xl border bg-gray-50 px-3 py-2 text-left text-sm text-gray-800 outline-none transition-colors focus:ring-2 focus:ring-amber-500 ${open ? 'border-amber-500 bg-white' : 'border-gray-200 hover:border-gray-300'}`}
      >
        <span className="truncate">{selectedOption?.label || placeholder}</span>
        <ChevronRight size={16} className={`ml-2 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-gray-900 bg-white p-1 shadow-lg" role="listbox">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            onClick={() => { onChange(''); setOpen(false); }}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${!value ? 'font-medium text-gray-900' : 'text-gray-600'}`}
          >
            {placeholder}
          </button>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              key={option.value}
              onClick={() => { onChange(option.value); setOpen(false); }}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 ${option.value === value ? 'bg-amber-50 font-semibold text-gray-900' : 'text-gray-700'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface JobItem {
  id: string;
  title: string;
  slug: string;
  jobCode: string;
  vacancies: number;
  employmentType: string;
  workMode: string;
  locationCity: string;
  locationState: string;
  minExperience: number;
  maxExperience: number | null;
  minSalary: number | null;
  maxSalary: number | null;
  currency: string;
  salaryVisibility: boolean;
  summary: string | null;
  description: string;
  postedAt: string | null;
  deadline: string | null;
  department: {
    id: string;
    name: string;
    code: string;
  };
}

export default function JobsPage() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [filterOptions, setFilterOptions] = useState<JobFilterOptions>({
    departments: [],
    employmentTypes: [],
    workModes: [],
    experienceLevels: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedEmploymentType, setSelectedEmploymentType] = useState('');
  const [selectedWorkMode, setSelectedWorkMode] = useState('');
  const [selectedExperience, setSelectedExperience] = useState('');
  const [sortBy, setSortBy] = useState('latest');

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string> = {
        sortBy,
      };

      if (searchTerm.trim()) params.q = searchTerm.trim();
      if (selectedDepartment) params.departmentId = selectedDepartment;
      if (selectedEmploymentType) params.employmentType = selectedEmploymentType;
      if (selectedWorkMode) params.workMode = selectedWorkMode;
      if (selectedExperience) params.experienceLevel = selectedExperience;

      const res = await api.get('/recruitment/public/jobs', { params });
      if (res.data?.success) {
        setJobs(res.data.jobs || []);
        if (res.data.filterOptions) {
          setFilterOptions({
            departments: Array.isArray(res.data.filterOptions.departments) ? res.data.filterOptions.departments : [],
            employmentTypes: Array.isArray(res.data.filterOptions.employmentTypes) ? res.data.filterOptions.employmentTypes : [],
            workModes: Array.isArray(res.data.filterOptions.workModes) ? res.data.filterOptions.workModes : [],
            experienceLevels: Array.isArray(res.data.filterOptions.experienceLevels) ? res.data.filterOptions.experienceLevels : [],
          });
        }
      }
    } catch (err: unknown) {
      console.error('Failed to load jobs:', err);
      setError(t('careers.unableToLoad', 'Unable to load job postings right now. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    // The request is intentionally re-run only when a user-facing filter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDepartment, selectedEmploymentType, selectedWorkMode, selectedExperience, sortBy]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchJobs();
  };

  const formatSalary = (min: number | null, max: number | null) => {
    if (!min && !max) return t('careers.bestInIndustry', 'Best in Industry');
    const formatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
    if (min && max) return `₹${formatter.format(min)} - ₹${formatter.format(max)} / yr`;
    if (min) return `From ₹${formatter.format(min)} / yr`;
    return `Up to ₹${formatter.format(max!)} / yr`;
  };

  const formatEmploymentType = (type: string) => {
    switch (type) {
      case 'FULL_TIME': return t('careers.fullTime', 'Full Time');
      case 'PART_TIME': return t('careers.partTime', 'Part Time');
      case 'CONTRACT': return t('careers.contract', 'Contract');
      case 'INTERNSHIP': return t('careers.internship', 'Internship');
      case 'FREELANCE': return t('careers.freelance', 'Freelance');
      default: return type;
    }
  };

  const formatWorkMode = (mode: string) => {
    switch (mode) {
      case 'ON_SITE': return t('careers.onSite', 'On-site');
      case 'REMOTE': return t('careers.remote', 'Remote');
      case 'HYBRID': return t('careers.hybrid', 'Hybrid');
      default: return mode;
    }
  };

  const formatExperienceLevel = (level: string) => {
    switch (level) {
      case 'FRESHER': return t('careers.fresher', 'Fresher (0-1 yrs)');
      case 'JUNIOR': return t('careers.junior', 'Junior (1-3 yrs)');
      case 'MID_LEVEL': return t('careers.midLevel', 'Mid Level (3-6 yrs)');
      case 'SENIOR': return t('careers.senior', 'Senior (5+ yrs)');
      case 'LEAD': return t('careers.lead', 'Lead');
      case 'EXECUTIVE': return t('careers.executive', 'Executive');
      default: return level;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Hero Header Banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-800 to-amber-950 text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-transparent opacity-60"></div>
        <div className="relative max-w-7xl mx-auto text-center space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs sm:text-sm font-medium backdrop-blur-sm">
            <Sparkles size={14} className="animate-pulse" />
            <span>{t('careers.badge', 'Careers at JCB Exchange')}</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            {t('careers.heroTitle', 'Shape the Future of Heavy Equipment Mobility')}
          </h1>


          {/* Search Box inside Hero */}
          <form onSubmit={handleSearchSubmit} className="max-w-3xl mx-auto pt-4">
            <div className="flex flex-col sm:flex-row items-center gap-2 bg-white/10 p-2 rounded-2xl border border-white/20 backdrop-blur-md shadow-2xl">
              <div className="relative flex-1 w-full flex items-center">
                <Search size={18} className="absolute left-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('careers.searchPlaceholder', 'Job title, keyword, or skill...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white text-gray-900 rounded-xl placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <button
                type="submit"
                className="w-full sm:w-auto px-6 py-3 bg-amber-500 hover:bg-amber-600 text-gray-950 font-bold text-sm rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <span>{t('careers.searchJobs', 'Search Jobs')}</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </form>
        </div>
      </section>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full flex-grow">
        {/* Filters and Sorting Toolbar */}
        <div className="bg-white rounded-2xl border border-gray-200/80 p-5 mb-8 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Filter size={16} className="text-amber-600" />
              <span>{t('careers.filterTitle', 'Filter Job Openings')}</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 font-medium hidden sm:inline">{t('careers.sortBy', 'Sort by:')}</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-gray-50 border border-gray-200 text-xs sm:text-sm text-gray-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="latest">{t('careers.sortLatest', 'Latest First')}</option>
                <option value="oldest">{t('careers.sortOldest', 'Oldest First')}</option>
                <option value="closingSoon">{t('careers.sortClosingSoon', 'Closing Soon')}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <FilterSelect
              label={t('careers.department', 'Department')}
              value={selectedDepartment}
              placeholder={t('careers.allDepartments', 'All Departments')}
              onChange={setSelectedDepartment}
              options={filterOptions.departments.map((dept) => ({ value: dept.id, label: dept.name }))}
            />

            {/* Employment Type Filter */}
            <FilterSelect
              label={t('careers.employmentType', 'Employment Type')}
              value={selectedEmploymentType}
              placeholder={t('careers.allTypes', 'All Types')}
              onChange={setSelectedEmploymentType}
              options={filterOptions.employmentTypes.map((type) => ({ value: type, label: formatEmploymentType(type) }))}
            />

            {/* Work Mode Filter */}
            <FilterSelect
              label={t('careers.workMode', 'Work Mode')}
              value={selectedWorkMode}
              placeholder={t('careers.allModes', 'All Modes')}
              onChange={setSelectedWorkMode}
              options={filterOptions.workModes.map((mode) => ({ value: mode, label: formatWorkMode(mode) }))}
            />

            {/* Experience Level Filter */}
            <FilterSelect
              label={t('careers.experienceLevel', 'Experience Level')}
              value={selectedExperience}
              placeholder={t('careers.anyExperience', 'Any Experience')}
              onChange={setSelectedExperience}
              options={filterOptions.experienceLevels.map((level) => ({ value: level, label: formatExperienceLevel(level) }))}
            />
          </div>

        </div>

        {/* Results Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-gray-900">
            {t('careers.openVacancies', 'Open Vacancies')} {!loading && `(${jobs.length})`}
          </h2>
          {(selectedDepartment || selectedEmploymentType || selectedWorkMode || selectedExperience || searchTerm) && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedDepartment('');
                setSelectedEmploymentType('');
                setSelectedWorkMode('');
                setSelectedExperience('');
              }}
              className="text-xs font-medium text-amber-600 hover:text-amber-700 underline"
            >
              {t('careers.clearAllFilters', 'Clear all filters')}
            </button>
          )}
        </div>

        {/* Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-white rounded-2xl p-6 border border-gray-200/80 animate-pulse space-y-4">
                <div className="h-5 bg-gray-200 rounded w-3/4"></div>
                <div className="h-4 bg-gray-100 rounded w-1/2"></div>
                <div className="h-12 bg-gray-50 rounded"></div>
                <div className="h-8 bg-gray-200 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl text-center space-y-3">
            <p className="text-sm font-medium">{error}</p>
            <button
              onClick={fetchJobs}
              className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded-lg hover:bg-red-700 transition-all"
            >
              {t('careers.tryAgain', 'Try Again')}
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && jobs.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-200/80 p-12 text-center space-y-4">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-600">
              <Briefcase size={28} />
            </div>
            <h3 className="text-lg font-bold text-gray-900">{t('careers.noJobsTitle', 'No Jobs Match Your Filter Criteria')}</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              {t('careers.noJobsSubtitle', "We couldn't find any active job postings matching your current search parameters. Try clearing some filters or searching with different keywords.")}
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedDepartment('');
                setSelectedEmploymentType('');
                setSelectedWorkMode('');
                setSelectedExperience('');
              }}
              className="px-5 py-2.5 bg-amber-500 text-gray-950 font-bold text-xs rounded-xl hover:bg-amber-600 transition-all shadow-sm"
            >
              {t('careers.resetFilters', 'Reset Search Filters')}
            </button>
          </div>
        )}

        {/* Jobs Grid */}
        {!loading && !error && jobs.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="group bg-white rounded-2xl border border-gray-200/80 p-6 hover:border-amber-400 hover:shadow-xl transition-all duration-300 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Top Badge Row */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/60 text-xs font-semibold">
                      <Building2 size={12} />
                      {job.department?.name || 'Department'}
                    </span>

                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-gray-100 text-gray-700 text-xs font-medium">
                      {formatWorkMode(job.workMode)}
                    </span>
                  </div>

                  {/* Title & Location */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-amber-600 transition-colors line-clamp-1">
                      <Link href={`/jobs/${job.slug}`}>
                        {job.title}
                      </Link>
                    </h3>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500 mt-2">
                      <span className="flex items-center gap-1">
                        <MapPin size={13} className="text-gray-400" />
                        {job.locationCity}, {job.locationState}
                      </span>

                      <span className="flex items-center gap-1">
                        <Clock size={13} className="text-gray-400" />
                        {formatEmploymentType(job.employmentType)}
                      </span>

                      <span className="flex items-center gap-1">
                        <Briefcase size={13} className="text-gray-400" />
                        {job.minExperience} - {job.maxExperience ? `${job.maxExperience} ${t('careers.yrsLabel', 'yrs')}` : t('careers.yrsPlusLabel', 'yrs+')}
                      </span>
                    </div>
                  </div>

                  {/* Summary */}
                  {job.summary && (
                    <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed font-normal">
                      {job.summary}
                    </p>
                  )}

                  {/* Metadata Bar */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs">
                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">{t('careers.salaryRange', 'Salary Range')}</span>
                      <span className="font-semibold text-gray-900">
                        {job.salaryVisibility
                          ? formatSalary(job.minSalary, job.maxSalary)
                          : t('careers.notDisclosed', 'Not Disclosed')}
                      </span>
                    </div>

                    <div>
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">{t('careers.vacancies', 'Vacancies')}</span>
                      <span className="font-semibold text-gray-900 flex items-center gap-1">
                        <Users size={12} className="text-amber-600" />
                        {job.vacancies} {job.vacancies === 1 ? t('careers.vacancyAvailable', 'Opening') : t('careers.vacanciesAvailable', 'Openings')}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Action */}
                <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
                  <span className="text-[11px] text-gray-400 flex items-center gap-1">
                    <Calendar size={12} />
                    {job.postedAt ? `${t('careers.postedAt', 'Posted')} ${new Date(job.postedAt).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}` : t('careers.recentlyPosted', 'Recently posted')}
                  </span>

                  <Link
                    href={`/jobs/${job.slug}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 group-hover:bg-amber-500 text-white group-hover:text-gray-950 font-bold text-xs transition-all shadow-sm"
                  >
                    <span>{t('careers.viewDetails', 'View Details')}</span>
                    <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
