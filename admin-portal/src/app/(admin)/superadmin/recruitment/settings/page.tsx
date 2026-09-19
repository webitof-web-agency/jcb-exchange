'use client';

/* eslint-disable react-hooks/set-state-in-effect */

import React, { useCallback, useEffect, useState } from 'react';
import api from '@/lib/api';
import BrandLoader from '@/components/ui/BrandLoader';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/store/authStore';
import { canUseRecruitmentPermission, recruitmentPermissions } from '@/lib/recruitmentPermissions';
import {
  Building2,
  Mail,
  Plus,
  Save,
  Code,
} from 'lucide-react';

interface DepartmentItem {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isActive: boolean;
  _count?: { jobs: number };
}

interface EmailTemplateItem {
  id: string;
  name: string;
  type: string;
  subject: string;
  body: string;
  isDefault: boolean;
}

export default function AdminRecruitmentSettingsPage() {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const canCreateDepartment = canUseRecruitmentPermission(currentUser, recruitmentPermissions.departmentsCreate);
  const canUpdateSettings = canUseRecruitmentPermission(currentUser, recruitmentPermissions.departmentsUpdate);
  const [activeTab, setActiveTab] = useState<'departments' | 'templates'>('departments');

  // Departments State
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [newDeptName, setNewDeptName] = useState('');
  const [newDeptCode, setNewDeptCode] = useState('');

  // Email Templates State
  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplateItem | null>(null);
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadedSections, setLoadedSections] = useState<Record<'departments' | 'templates', boolean>>({
    departments: false,
    templates: false,
  });

  const fetchSettings = useCallback(async (section: 'departments' | 'templates') => {
    if (loadedSections[section]) return;

    try {
      setLoading(true);
      const res = await api.get('/recruitment/admin/settings', { params: { section } });
      if (res.data && res.data.success) {
        if (section === 'departments') {
          const departmentList = res.data.data?.departments || res.data.departments || [];
          setDepartments(departmentList.length ? departmentList : getMockDepartments());
        }

        if (section === 'templates') {
          const templateList = res.data.data?.emailTemplates || res.data.templates || [];
          const nextTemplates = templateList.length ? templateList : getMockTemplates();
          setTemplates(nextTemplates);
          setSelectedTemplate((current) => {
            if (current) return current;
            const firstTemplate = nextTemplates[0];
            if (firstTemplate) {
              setTemplateSubject(firstTemplate.subject);
              setTemplateBody(firstTemplate.body);
            }
            return firstTemplate || null;
          });
        }

        setLoadedSections((prev) => ({ ...prev, [section]: true }));
      } else if (section === 'departments') {
        setDepartments(getMockDepartments());
      } else {
        const fallbackTemplates = getMockTemplates();
        setTemplates(fallbackTemplates);
        setSelectedTemplate(fallbackTemplates[0]);
        setTemplateSubject(fallbackTemplates[0].subject);
        setTemplateBody(fallbackTemplates[0].body);
      }
    } catch (err) {
      console.warn('Backend settings fetch failed, using fallback mock data:', err);
      if (section === 'departments') {
        setDepartments(getMockDepartments());
      } else {
        const fallbackTemplates = getMockTemplates();
        setTemplates(fallbackTemplates);
        setSelectedTemplate(fallbackTemplates[0]);
        setTemplateSubject(fallbackTemplates[0].subject);
        setTemplateBody(fallbackTemplates[0].body);
      }
    } finally {
      setLoading(false);
    }
  }, [loadedSections]);

  useEffect(() => {
    if (activeTab === 'departments' || activeTab === 'templates') {
      void fetchSettings(activeTab);
    } else {
      setLoading(false);
    }
  }, [activeTab, fetchSettings]);

  const handleSelectTemplate = (tmpl: EmailTemplateItem) => {
    setSelectedTemplate(tmpl);
    setTemplateSubject(tmpl.subject);
    setTemplateBody(tmpl.body);
  };

  const handleSaveTemplate = async () => {
    if (!canUpdateSettings) return;
    if (!selectedTemplate) return;
    try {
      setSavingTemplate(true);
      await api.put(`/recruitment/admin/settings/templates/${selectedTemplate.id}`, {
        subject: templateSubject,
        bodyHtml: templateBody,
      });

      setTemplates((prev) =>
        prev.map((t) =>
          t.id === selectedTemplate.id
            ? { ...t, subject: templateSubject, body: templateBody }
            : t
        )
      );

      alert('Email template updated successfully!');
    } catch (err) {
      console.error('Failed to update email template:', err);
      alert('Failed to save email template changes.');
    } finally {
      setSavingTemplate(false);
    }
  };

  const insertVariable = (variable: string) => {
    if (!canUpdateSettings) return;
    setTemplateBody((prev) => prev + ` ${variable}`);
  };

  return (
    <div className="min-h-screen bg-gray-50/50 flex flex-col">
      <main className="max-w-7xl mx-auto px-0 pt-0 pb-6 w-full space-y-4 flex-grow">
        {loading ? (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
            <BrandLoader variant="section" size="sm" bg="light" text={t('recruitment.analyticsLoading', 'Loading recruitment settings...')} />
          </div>
        ) : null}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-gray-200 mb-6">
          <button
            onClick={() => setActiveTab('departments')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-extrabold border-b-2 transition ${
              activeTab === 'departments'
                ? 'border-amber-500 text-amber-600 bg-amber-50/40 rounded-t-xl'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Building2 size={16} />
            <span>{t('recruitment.jobDepartments', 'Job Departments')} ({departments.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-extrabold border-b-2 transition ${
              activeTab === 'templates'
                ? 'border-amber-500 text-amber-600 bg-amber-50/40 rounded-t-xl'
                : 'border-transparent text-gray-500 hover:text-gray-900'
            }`}
          >
            <Mail size={16} />
            <span>{t('recruitment.emailTemplates', 'Email Communication Templates')} ({templates.length})</span>
          </button>
        </div>

        {/* Tab 1: Departments */}
        {activeTab === 'departments' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 shadow-sm overflow-hidden p-6">
              <h3 className="text-base font-extrabold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 size={18} className="text-amber-500" />
                {t('recruitment.activeJobDepartments', 'Active Job Departments')}
              </h3>

              <div className="space-y-3">
                {departments.map((dept) => (
                  <div
                    key={dept.id}
                    className="p-4 bg-gray-50 rounded-xl border border-gray-200 flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-gray-900 text-sm">{dept.name}</span>
                        <span className="px-2 py-0.5 bg-gray-200 text-gray-700 font-mono text-[10px] font-bold rounded">
                          {dept.code}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {dept.description || t('recruitment.noDescription', 'No description added')}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-500">
                        {t('recruitment.activeJobsCount', '{count} active jobs').replace('{count}', String(dept._count?.jobs || 0))}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded-md ${
                          dept.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {dept.isActive ? t('visitorDetails.active', 'Active') : t('visitorDetails.inactive', 'Inactive')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6">
              <h3 className="text-base font-extrabold text-gray-900 mb-4 flex items-center gap-2">
                <Plus size={18} className="text-amber-500" />
                {t('recruitment.addNewDepartment', 'Add New Department')}
              </h3>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!canCreateDepartment) return;
                  if (!newDeptName || !newDeptCode) return;
                  try {
                    const res = await api.post('/recruitment/admin/departments', {
                      name: newDeptName.trim(),
                      code: newDeptCode.trim().toUpperCase(),
                      description: `Custom ${newDeptName.trim()} department`,
                    });
                    const createdDepartment = res.data?.department || res.data?.data;
                    if (createdDepartment) {
                      setDepartments((prev) => [...prev, createdDepartment]);
                    } else {
                      setLoadedSections((prev) => ({ ...prev, departments: false }));
                    }
                    setNewDeptName('');
                    setNewDeptCode('');
                    alert('Department added successfully!');
                  } catch (err) {
                    console.error('Failed to create department:', err);
                    alert('Failed to create department.');
                  }
                }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.departmentName', 'Department Name')} *</label>
                  <input
                    type="text"
                    placeholder="e.g. Field Operations"
                    value={newDeptName}
                    onChange={(e) => setNewDeptName(e.target.value)}
                    required
                    disabled={!canCreateDepartment}
                    className="w-full py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-amber-500 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.departmentCode', 'Department Code')} *</label>
                  <input
                    type="text"
                    placeholder="e.g. FIELD_OPS"
                    value={newDeptCode}
                    onChange={(e) => setNewDeptCode(e.target.value)}
                    required
                    disabled={!canCreateDepartment}
                    className="w-full py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-amber-500 outline-none uppercase font-mono disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!canCreateDepartment}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-md transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {t('recruitment.addDepartment', 'Create Department')}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Tab 2: Email Communication Templates */}
        {activeTab === 'templates' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sidebar list of templates */}
            <div className="bg-white rounded-2xl border border-gray-200/80 shadow-sm p-4 space-y-2">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 mb-2">
                {t('recruitment.availableTemplates', 'Available Templates')}
              </h3>
              {templates.map((tmpl) => (
                <button
                  key={tmpl.id}
                  onClick={() => handleSelectTemplate(tmpl)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    selectedTemplate?.id === tmpl.id
                      ? 'bg-amber-50 border-amber-300 text-amber-900 font-extrabold shadow-sm'
                      : 'bg-gray-50 border-gray-200 text-gray-700 font-semibold hover:bg-gray-100'
                  }`}
                >
                  <p className="text-xs">{tmpl.name}</p>
                  <p className="text-[10px] text-gray-500 font-mono mt-0.5">{tmpl.type}</p>
                </button>
              ))}
            </div>

            {/* Template Editor */}
            {selectedTemplate && (
              <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 shadow-sm p-6 space-y-5">
                <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                  <div>
                    <h3 className="text-base font-extrabold text-gray-900">{selectedTemplate.name}</h3>
                    <p className="text-xs text-gray-500">{t('recruitment.editTemplateHelp', 'Edit automated candidate email notification body')}</p>
                  </div>

                  <button
                    onClick={handleSaveTemplate}
                    disabled={savingTemplate || !canUpdateSettings}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save size={14} />
                    <span>{savingTemplate ? t('recruitment.saving', 'Saving...') : t('recruitment.saveTemplate', 'Save Template')}</span>
                  </button>
                </div>

                {/* Merge Placeholders Palette */}
                <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-200/80">
                  <p className="text-[11px] font-bold text-amber-900 mb-2 flex items-center gap-1">
                    <Code size={13} /> {t('recruitment.insertMergeTagHelp', 'Click to insert dynamic merge tag into email body:')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      '{{candidate_name}}',
                      '{{job_title}}',
                      '{{application_ref}}',
                      '{{interview_date}}',
                      '{{meeting_link}}',
                      '{{offer_ctc}}',
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => insertVariable(tag)}
                        className="px-2 py-1 bg-white hover:bg-amber-100 text-amber-900 font-mono text-[11px] font-bold rounded-md border border-amber-300 transition"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.subjectLine', 'Subject Line')}</label>
                  <input
                    type="text"
                    value={templateSubject}
                    onChange={(e) => setTemplateSubject(e.target.value)}
                    disabled={!canUpdateSettings}
                    className="w-full py-2.5 px-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:ring-2 focus:ring-amber-500 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">{t('recruitment.emailBodyContent', 'Email Body Content')}</label>
                  <textarea
                    rows={10}
                    value={templateBody}
                    onChange={(e) => setTemplateBody(e.target.value)}
                    disabled={!canUpdateSettings}
                    className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl text-xs font-mono text-gray-800 leading-relaxed focus:ring-2 focus:ring-amber-500 outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  ></textarea>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

// Fallback Mock Data
function getMockDepartments(): DepartmentItem[] {
  return [
    { id: 'dept-1', name: 'Engineering & Field Service', code: 'ENG', isActive: true, _count: { jobs: 3 } },
    { id: 'dept-2', name: 'Sales & Machinery Trading', code: 'SALES', isActive: true, _count: { jobs: 2 } },
    { id: 'dept-3', name: 'Spare Parts & Logistics', code: 'PARTS', isActive: true, _count: { jobs: 1 } },
    { id: 'dept-4', name: 'Human Resources & Talent', code: 'HR', isActive: true, _count: { jobs: 0 } },
  ];
}

function getMockTemplates(): EmailTemplateItem[] {
  return [
    {
      id: 'tmpl-1',
      name: 'Application Receipt Confirmation',
      type: 'APPLICATION_CONFIRMATION',
      subject: 'Application Received: {{job_title}} at JCB Exchange',
      body: 'Dear {{candidate_name}},\n\nThank you for applying for the position of {{job_title}} at JCB Exchange.\n\nYour application reference number is {{application_ref}}.\nOur talent acquisition team will review your profile and reach out if there is a match.\n\nBest regards,\nJCB Exchange Recruitment Team',
      isDefault: true,
    },
    {
      id: 'tmpl-2',
      name: 'Interview Schedule Invitation',
      type: 'INTERVIEW_INVITE',
      subject: 'Interview Scheduled for {{job_title}} position - JCB Exchange',
      body: 'Hi {{candidate_name}},\n\nWe are pleased to invite you for an interview for the {{job_title}} role.\n\nDate & Time: {{interview_date}}\nMeeting Link: {{meeting_link}}\n\nPlease let us know if you need to reschedule.\n\nWarm regards,\nJCB Exchange HR',
      isDefault: true,
    },
    {
      id: 'tmpl-3',
      name: 'Application Rejection Notice',
      type: 'REJECTION_NOTICE',
      subject: 'Update regarding your application for {{job_title}}',
      body: 'Dear {{candidate_name}},\n\nThank you for your interest in the {{job_title}} position at JCB Exchange and taking time to interview with us.\n\nAfter careful consideration, we have decided to move forward with another candidate whose qualifications more closely align with our current needs.\n\nWe wish you success in your job search.\n\nSincerely,\nJCB Exchange Talent Team',
      isDefault: true,
    },
  ];
}
