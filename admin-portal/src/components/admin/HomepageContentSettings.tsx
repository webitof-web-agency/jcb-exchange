'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { AxiosError } from 'axios';
import { ImagePlus, Plus, Save, ShieldCheck, Trash2, UploadCloud } from 'lucide-react';
import { toast } from 'react-toastify';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import {
  getAbsoluteFileUrl,
  MAX_FINANCE_SUPPORT_IMAGE_INPUT_SIZE,
  MAX_HERO_IMAGE_INPUT_SIZE,
  MAX_INSPECTION_SECTION_IMAGE_INPUT_SIZE,
  MAX_SITE_FAVICON_IMAGE_INPUT_SIZE,
  MAX_SITE_MANIFEST_ICON_IMAGE_INPUT_SIZE,
  MAX_SITE_LOGO_IMAGE_INPUT_SIZE,
  uploadFinanceSupportImageToServer,
  uploadHeroImageToServer,
  uploadInspectionSectionImageToServer,
  uploadSiteFaviconImageToServer,
  uploadSiteManifestIconImageToServer,
  uploadSiteLogoImageToServer,
} from '@/lib/fileUpload';

type FinanceSupportItem = {
  id: string;
  name: string;
  imageUrl: string;
  displayOrder: number;
  row?: 1 | 2;
  updatedAt?: string | null;
  updatedByUserId?: string | null;
  previewUrl?: string;
};

type FinanceSupportResponse = {
  items: FinanceSupportItem[];
};

type InspectionSectionResponse = {
  title?: string | null;
  description?: string | null;
  imageUrl?: string | null;
};

type SiteLogoResponse = {
  imageUrl?: string | null;
  faviconUrl?: string | null;
  manifestIconUrl?: string | null;
};

const getApiErrorMessage = (error: unknown, fallbackMessage: string) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || fallbackMessage;
};

const createEmptyItem = (): FinanceSupportItem => ({
  id: globalThis.crypto?.randomUUID?.() || `finance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  name: '',
  imageUrl: '',
  displayOrder: 0,
  previewUrl: '',
});

export default function HomepageContentSettings() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'finance-support' | 'hero-image' | 'inspection-section' | 'site-logo'>('finance-support');
  const [items, setItems] = useState<FinanceSupportItem[]>([]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(null);
  const [faviconPreviewUrl, setFaviconPreviewUrl] = useState<string | null>(null);
  const [manifestIconUrl, setManifestIconUrl] = useState<string | null>(null);
  const [manifestIconPreviewUrl, setManifestIconPreviewUrl] = useState<string | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [heroImagePreviewUrl, setHeroImagePreviewUrl] = useState<string | null>(null);
  const [heroHeadline, setHeroHeadline] = useState('');
  const [inspectionTitle, setInspectionTitle] = useState('');
  const [inspectionDescription, setInspectionDescription] = useState('');
  const [inspectionImageUrl, setInspectionImageUrl] = useState<string | null>(null);
  const [inspectionImagePreviewUrl, setInspectionImagePreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);


  useEffect(() => {
    let cancelled = false;

    const loadItems = async () => {
      setLoading(true);

      try {
        const [financeResult, heroResult, inspectionResult, siteLogoResult] = await Promise.allSettled([
          api.get<FinanceSupportResponse>('/superadmin/finance-support'),
          api.get<{ imageUrl: string | null; headline?: string | null }>('/superadmin/hero-image'),
          api.get<InspectionSectionResponse>('/superadmin/inspection-section'),
          api.get<SiteLogoResponse>('/superadmin/site-logo'),
        ]);

        if (cancelled) {
          return;
        }

        if (financeResult.status === 'fulfilled') {
          setItems(
            financeResult.value.data.items.map((item, index) => ({
              ...item,
              displayOrder: index,
              previewUrl: getAbsoluteFileUrl(item.imageUrl),
            }))
          );
        } else {
          setItems([]);
        }

        if (heroResult.status === 'fulfilled') {
          setHeroImageUrl(heroResult.value.data.imageUrl);
          setHeroImagePreviewUrl(getAbsoluteFileUrl(heroResult.value.data.imageUrl));
          setHeroHeadline(heroResult.value.data.headline || '');
        } else {
          setHeroImageUrl(null);
          setHeroImagePreviewUrl(null);
          setHeroHeadline('');
        }

        if (inspectionResult.status === 'fulfilled') {
          setInspectionTitle(inspectionResult.value.data.title || '');
          setInspectionDescription(inspectionResult.value.data.description || '');
          setInspectionImageUrl(inspectionResult.value.data.imageUrl || null);
          setInspectionImagePreviewUrl(getAbsoluteFileUrl(inspectionResult.value.data.imageUrl || null));
        } else {
          setInspectionTitle('');
          setInspectionDescription('');
          setInspectionImageUrl(null);
          setInspectionImagePreviewUrl(null);
        }

        if (siteLogoResult.status === 'fulfilled') {
          setLogoUrl(siteLogoResult.value.data.imageUrl || null);
          setLogoPreviewUrl(getAbsoluteFileUrl(siteLogoResult.value.data.imageUrl || null));
          setFaviconUrl(siteLogoResult.value.data.faviconUrl || null);
          setFaviconPreviewUrl(getAbsoluteFileUrl(siteLogoResult.value.data.faviconUrl || null));
          setManifestIconUrl(siteLogoResult.value.data.manifestIconUrl || null);
          setManifestIconPreviewUrl(getAbsoluteFileUrl(siteLogoResult.value.data.manifestIconUrl || null));
        } else {
          setLogoUrl(null);
          setLogoPreviewUrl(null);
          setFaviconUrl(null);
          setFaviconPreviewUrl(null);
          setManifestIconUrl(null);
          setManifestIconPreviewUrl(null);
        }

        if (financeResult.status === 'rejected' && heroResult.status === 'rejected' && inspectionResult.status === 'rejected' && siteLogoResult.status === 'rejected') {
          toast.error(t('homepageSettings.loadFailed'));
        } else if (financeResult.status === 'rejected') {
          toast.error(t('homepageSettings.loadFinanceFailed'));
        } else if (heroResult.status === 'rejected') {
          toast.error(t('homepageSettings.loadHeroFailed'));
        } else if (inspectionResult.status === 'rejected') {
          toast.error(t('homepageSettings.loadInspectionFailed'));
        } else if (siteLogoResult.status === 'rejected') {
          toast.error('Failed to load site logo settings.');
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(getApiErrorMessage(err, t('homepageSettings.loadFailed')));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadItems();

    return () => {
      cancelled = true;
    };
  }, [t]);

  const updateItem = (id: string, updater: (item: FinanceSupportItem) => FinanceSupportItem) => {
    setItems((current) =>
      current.map((item, index) =>
        item.id === id
          ? {
            ...updater(item),
            displayOrder: index,
          }
          : {
            ...item,
            displayOrder: index,
          }
      )
    );
  };

  const handleAddItem = () => {
    setItems((current) => [
      ...current,
      {
        ...createEmptyItem(),
        displayOrder: current.length,
      },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setItems((current) =>
      current
        .filter((item) => item.id !== id)
        .map((item, index) => ({
          ...item,
          displayOrder: index,
        }))
    );
  };

  const handleImageUpload = async (id: string, file: File) => {
    setUploadingId(id);

    try {
      const uploaded = await uploadFinanceSupportImageToServer(file);

      updateItem(id, (item) => ({
        ...item,
        imageUrl: uploaded.fileUrl,
        previewUrl: uploaded.absoluteUrl,
      }));
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('homepageSettings.uploadImageFailed')));
    } finally {
      setUploadingId(null);
    }
  };

  const handleHeroImageUpload = async (file: File) => {
    setUploadingId('hero-image');

    try {
      const uploaded = await uploadHeroImageToServer(file);
      setHeroImageUrl(uploaded.fileUrl);
      setHeroImagePreviewUrl(uploaded.absoluteUrl);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('homepageSettings.uploadHeroFailed')));
    } finally {
      setUploadingId(null);
    }
  };

  const handleInspectionImageUpload = async (file: File) => {
    setUploadingId('inspection-section');

    try {
      const uploaded = await uploadInspectionSectionImageToServer(file);
      setInspectionImageUrl(uploaded.fileUrl);
      setInspectionImagePreviewUrl(uploaded.absoluteUrl);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('homepageSettings.uploadInspectionFailed')));
    } finally {
      setUploadingId(null);
    }
  };

  const handleSiteLogoUpload = async (file: File) => {
    setUploadingId('site-logo');

    try {
      const uploaded = await uploadSiteLogoImageToServer(file);
      await persistSiteLogoSettings({
        nextLogoUrl: uploaded.fileUrl,
        nextLogoPreviewUrl: uploaded.absoluteUrl,
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to upload logo.'));
    } finally {
      setUploadingId(null);
    }
  };

  const handleSiteFaviconUpload = async (file: File) => {
    setUploadingId('site-favicon');

    try {
      const uploaded = await uploadSiteFaviconImageToServer(file);
      await persistSiteLogoSettings({
        nextFaviconUrl: uploaded.fileUrl,
        nextFaviconPreviewUrl: uploaded.absoluteUrl,
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to upload favicon.'));
    } finally {
      setUploadingId(null);
    }
  };

  const handleSiteManifestIconUpload = async (file: File) => {
    setUploadingId('site-manifest-icon');

    try {
      const uploaded = await uploadSiteManifestIconImageToServer(file);
      await persistSiteLogoSettings({
        nextManifestIconUrl: uploaded.fileUrl,
        nextManifestIconPreviewUrl: uploaded.absoluteUrl,
      });
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to upload manifest icon.'));
    } finally {
      setUploadingId(null);
    }
  };

  const persistSiteLogoSettings = async ({
    nextLogoUrl = logoUrl,
    nextLogoPreviewUrl = logoPreviewUrl,
    nextFaviconUrl = faviconUrl,
    nextFaviconPreviewUrl = faviconPreviewUrl,
    nextManifestIconUrl = manifestIconUrl,
    nextManifestIconPreviewUrl = manifestIconPreviewUrl,
    successMessage,
  }: {
    nextLogoUrl?: string | null;
    nextLogoPreviewUrl?: string | null;
    nextFaviconUrl?: string | null;
    nextFaviconPreviewUrl?: string | null;
    nextManifestIconUrl?: string | null;
    nextManifestIconPreviewUrl?: string | null;
    successMessage?: string;
  } = {}) => {
    const response = await api.put<{
      message: string;
      imageUrl: string | null;
      faviconUrl: string | null;
      manifestIconUrl: string | null;
    }>('/superadmin/site-logo', {
      imageUrl: nextLogoUrl,
      faviconUrl: nextFaviconUrl,
      manifestIconUrl: nextManifestIconUrl,
    });

    setLogoUrl(response.data.imageUrl);
    setLogoPreviewUrl(nextLogoPreviewUrl ?? getAbsoluteFileUrl(response.data.imageUrl));
    setFaviconUrl(response.data.faviconUrl);
    setFaviconPreviewUrl(nextFaviconPreviewUrl ?? getAbsoluteFileUrl(response.data.faviconUrl));
    setManifestIconUrl(response.data.manifestIconUrl);
    setManifestIconPreviewUrl(nextManifestIconPreviewUrl ?? getAbsoluteFileUrl(response.data.manifestIconUrl));
    toast.success(successMessage || response.data.message);
  };

  const handleSave = async () => {
    setSaving(true);

    if (activeTab === 'finance-support') {
      const normalizedItems = items.map((item, index) => ({
        id: item.id,
        name: item.name.trim(),
        imageUrl: item.imageUrl.trim(),
        displayOrder: index,
      }));

      const hasInvalidItem = normalizedItems.some((item) => !item.name || !item.imageUrl);
      if (hasInvalidItem) {
        setSaving(false);
        toast.error(t('homepageSettings.financeValidation'));
        return;
      }

      try {
        const response = await api.put<{
          message: string;
          items: FinanceSupportItem[];
        }>('/superadmin/finance-support', {
          items: normalizedItems,
        });

        setItems(
          response.data.items.map((item, index) => ({
            ...item,
            displayOrder: index,
            previewUrl: getAbsoluteFileUrl(item.imageUrl),
          }))
        );
        toast.success(response.data.message);
      } catch (err) {
        toast.error(getApiErrorMessage(err, t('homepageSettings.saveFinanceFailed')));
      } finally {
        setSaving(false);
      }

      return;
    }

    if (activeTab === 'inspection-section') {
      try {
        const response = await api.put<{
          message: string;
          title: string | null;
          description: string | null;
          imageUrl: string | null;
        }>('/superadmin/inspection-section', {
          title: inspectionTitle,
          description: inspectionDescription,
          imageUrl: inspectionImageUrl,
        });

        setInspectionTitle(response.data.title || '');
        setInspectionDescription(response.data.description || '');
        setInspectionImageUrl(response.data.imageUrl);
        setInspectionImagePreviewUrl(getAbsoluteFileUrl(response.data.imageUrl));
        toast.success(response.data.message);
      } catch (err) {
        toast.error(getApiErrorMessage(err, t('homepageSettings.saveInspectionFailed')));
      } finally {
        setSaving(false);
      }

      return;
    }

    if (activeTab === 'site-logo') {
      try {
        await persistSiteLogoSettings();
      } catch (err) {
        toast.error(getApiErrorMessage(err, 'Failed to save site logo.'));
      } finally {
        setSaving(false);
      }

      return;
    }

    try {
      const response = await api.put<{
        message: string;
        imageUrl: string | null;
        headline: string | null;
      }>('/superadmin/hero-image', {
        imageUrl: heroImageUrl,
        headline: heroHeadline,
      });

      setHeroImageUrl(response.data.imageUrl);
      setHeroImagePreviewUrl(getAbsoluteFileUrl(response.data.imageUrl));
      setHeroHeadline(response.data.headline || '');
      toast.success(response.data.message);
    } catch (err) {
      toast.error(getApiErrorMessage(err, t('homepageSettings.saveHeroFailed')));
    } finally {
      setSaving(false);
    }
  };

  const renderFinanceSupportItem = (item: FinanceSupportItem) => (
    <div key={item.id} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div>
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('homepageSettings.brandName')}</span>
            <input
              type="text"
              value={item.name}
              onChange={(event) =>
                updateItem(item.id, (current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              placeholder={t('homepageSettings.brandNamePlaceholder')}
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
            />
          </label>
        </div>

        <div className="block">
          <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('homepageSettings.brandImage')}</span>
          <label className="flex min-h-[92px] cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition hover:border-[#FFC107] hover:bg-yellow-50">
            <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
              {item.previewUrl ? (
                <Image
                  src={item.previewUrl}
                  alt={item.name || t('homepageSettings.financeSupportLogoAlt')}
                  width={64}
                  height={40}
                  unoptimized
                  className="max-h-10 max-w-[64px] object-contain"
                />
              ) : (
                <ImagePlus className="h-5 w-5 text-gray-400" />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-800">
                {uploadingId === item.id ? t('homepageSettings.uploading') : t('homepageSettings.uploadLogo')}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                JPG, PNG, WEBP only. Max {Math.round(MAX_FINANCE_SUPPORT_IMAGE_INPUT_SIZE / (1024 * 1024))}MB.
              </p>
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImageUpload(item.id, file);
                }
                event.target.value = '';
              }}
            />
          </label>
        </div>

        <div className="flex items-start gap-2 xl:flex-col">

          <button
            type="button"
            onClick={() => handleRemoveItem(item.id)}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
          >
            <Trash2 className="h-4 w-4" />
            {t('homepageSettings.delete')}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="relative overflow-hidden bg-gray-900 px-6 py-8 sm:px-8">
          <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-800 to-[#FFC107]/20" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-white">
                {activeTab === 'finance-support'
                  ? t('homepageSettings.homepageSetting')
                  : activeTab === 'hero-image'
                    ? t('homepageSettings.heroImageSettings')
                    : activeTab === 'site-logo'
                      ? t('homepageSettings.platformLogoSettings')
                      : t('homepageSettings.certifiedInspectionSection')}
              </h2>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
              {t('homepageSettings.activeModule')}
            </span>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-col gap-0 lg:flex-row">
          <aside className="border-b border-gray-200 bg-[#FCFAF5] p-5 lg:w-72 lg:border-b-0 lg:border-r">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setActiveTab('finance-support')}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${activeTab === 'finance-support'
                    ? 'border-[#FFC107] bg-white text-gray-900 shadow-sm'
                    : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-white'
                  }`}
              >
                <ImagePlus className="h-4 w-4" />
                {t('homepageSettings.financeSupport')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('hero-image')}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${activeTab === 'hero-image'
                    ? 'border-[#FFC107] bg-white text-gray-900 shadow-sm'
                    : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-white'
                  }`}
              >
                <ImagePlus className="h-4 w-4" />
                {t('homepageSettings.heroImage')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('inspection-section')}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${activeTab === 'inspection-section'
                    ? 'border-[#FFC107] bg-white text-gray-900 shadow-sm'
                    : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-white'
                  }`}
              >
                <ImagePlus className="h-4 w-4" />
                {t('homepageSettings.certifiedSection')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('site-logo')}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition ${activeTab === 'site-logo'
                    ? 'border-[#FFC107] bg-white text-gray-900 shadow-sm'
                    : 'border-transparent text-gray-600 hover:border-gray-200 hover:bg-white'
                  }`}
              >
                <ImagePlus className="h-4 w-4" />
                {t('homepageSettings.siteLogo')}
              </button>
            </div>
          </aside>

          <div className="flex-1 p-6">
            <div className="mb-6 flex justify-end">
              <div className="flex flex-wrap gap-3">
                {activeTab === 'finance-support' ? (
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 transition hover:border-[#FFC107] hover:text-black"
                  >
                    <Plus className="h-4 w-4" />
                    {t('homepageSettings.addBrand')}
                  </button>
                ) : null}
                {activeTab !== 'site-logo' ? (
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#FFC107] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5AD06] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Save className="h-4 w-4" />
                    {saving ? t('homepageSettings.saving') : t('homepageSettings.saveChanges')}
                  </button>
                ) : null}
              </div>
            </div>

            {loading ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-12 text-center text-sm text-gray-500">
                {t('common.loading')}
              </div>
            ) : activeTab === 'finance-support' ? (
              items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-12 text-center text-sm text-gray-500">
                  {t('homepageSettings.emptyFinanceSupport')}
                </div>
              ) : (
                <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  <div className="space-y-4">
                    {items.map((item) => renderFinanceSupportItem(item))}
                  </div>
                </div>
              )
            ) : activeTab === 'hero-image' ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 max-h-[600px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="mb-5">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('homepageSettings.heroHeadingText')}</span>
                    <textarea
                      value={heroHeadline}
                      onChange={(event) => setHeroHeadline(event.target.value)}
                      placeholder={t('homepageSettings.heroHeadingPlaceholder')}
                      rows={4}
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    />
                  </label>
                </div>

                <div className="mb-4">
                  <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('homepageSettings.currentHeroImage')}</span>
                  <label className="flex min-h-[200px] w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 text-sm font-medium text-gray-700 transition hover:border-[#FFC107] hover:bg-yellow-50">
                    {heroImagePreviewUrl ? (
                      <Image
                        src={heroImagePreviewUrl}
                        alt={t('homepageSettings.currentHeroImage')}
                        width={960}
                        height={300}
                        unoptimized
                        className="max-h-[300px] max-w-full rounded-lg object-cover shadow-sm"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-gray-400">
                        <ImagePlus className="mb-2 h-8 w-8" />
                        <p>{t('homepageSettings.noHeroImage')}</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="font-semibold text-gray-800">
                        {uploadingId === 'hero-image' ? t('homepageSettings.uploading') : t('homepageSettings.uploadHeroImage')}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        High resolution JPG, PNG, WEBP. Max {Math.round(MAX_HERO_IMAGE_INPUT_SIZE / (1024 * 1024))}MB.
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleHeroImageUpload(file);
                        }
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>
                {heroImagePreviewUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setHeroImageUrl(null);
                      setHeroImagePreviewUrl(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('homepageSettings.removeImage')}
                  </button>
                ) : null}
              </div>
            ) : activeTab === 'inspection-section' ? (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-6 max-h-[600px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div className="mb-5">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('homepageSettings.sectionTitle')}</span>
                    <input
                      type="text"
                      value={inspectionTitle}
                      onChange={(event) => setInspectionTitle(event.target.value)}
                      placeholder={t('homepageSettings.sectionTitlePlaceholder')}
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    />
                  </label>
                </div>

                <div className="mb-5">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('homepageSettings.sectionDescription')}</span>
                    <textarea
                      value={inspectionDescription}
                      onChange={(event) => setInspectionDescription(event.target.value)}
                      placeholder={t('homepageSettings.sectionDescriptionPlaceholder')}
                      rows={4}
                      className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-[#FFC107] focus:ring-1 focus:ring-[#FFC107]"
                    />
                  </label>
                </div>

                <div className="mb-4">
                  <span className="mb-1.5 block text-sm font-semibold text-gray-700">{t('homepageSettings.sectionImage')}</span>
                  <label className="flex min-h-[220px] w-full cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 text-sm font-medium text-gray-700 transition hover:border-[#FFC107] hover:bg-yellow-50">
                    {inspectionImagePreviewUrl ? (
                      <Image
                        src={inspectionImagePreviewUrl}
                        alt={t('homepageSettings.sectionImage')}
                        width={960}
                        height={360}
                        unoptimized
                        className="max-h-[360px] max-w-full rounded-2xl object-cover shadow-sm"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-gray-400">
                        <ImagePlus className="mb-2 h-8 w-8" />
                        <p>{t('homepageSettings.noSectionImage')}</p>
                      </div>
                    )}
                    <div className="text-center">
                      <p className="font-semibold text-gray-800">
                        {uploadingId === 'inspection-section' ? t('homepageSettings.uploading') : t('homepageSettings.uploadSectionImage')}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        JPG, PNG, WEBP. Max {Math.round(MAX_INSPECTION_SECTION_IMAGE_INPUT_SIZE / (1024 * 1024))}MB. Image is compressed before save.
                      </p>
                    </div>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void handleInspectionImageUpload(file);
                        }
                        event.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {inspectionImagePreviewUrl ? (
                  <button
                    type="button"
                    onClick={() => {
                      setInspectionImageUrl(null);
                      setInspectionImagePreviewUrl(null);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
                  >
                    <Trash2 className="h-4 w-4" />
                    {t('homepageSettings.removeImage')}
                  </button>
                ) : null}
              </div>
            ) : activeTab === 'site-logo' ? (
              <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">{t('homepageSettings.platformLogoSettings')}</h3>
                  <p className="text-sm text-gray-500">{t('homepageSettings.platformLogoDescription')}</p>
                  <p className="mt-2 text-xs font-medium text-emerald-700">{t('homepageSettings.siteLogoAutoSaveHelp')}</p>
                </div>

                <div className="grid gap-6 grid-cols-1 xl:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-6">
                    <h4 className="mb-4 text-sm font-semibold text-gray-900">{t('homepageSettings.siteLogoCardTitle')}</h4>
                    {logoPreviewUrl ? (
                      <div
                        className="relative mb-4 overflow-hidden rounded-xl shadow-sm ring-1 ring-gray-900/5 h-32 w-full flex items-center justify-center p-4"
                        style={{
                          backgroundColor: '#ffffff',
                          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h12v12H0zm12 12h12v12H12z\' fill=\'%23f3f4f6\' fill-rule=\'evenodd\'/%3E%3C/svg%3E")'
                        }}
                      >
                        <Image
                          src={logoPreviewUrl}
                          alt="Logo Preview"
                          width={200}
                          height={80}
                          unoptimized
                          className="object-contain max-h-full"
                        />
                      </div>
                    ) : null}

                    <div className="flex items-center justify-center">
                      <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white py-10 transition hover:border-[#FFC107] hover:bg-[#FFFDF7]">
                        <div className="rounded-full bg-gray-100 p-3 text-gray-500">
                          <UploadCloud className="h-6 w-6" />
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-gray-800">
                            {uploadingId === 'site-logo' ? t('homepageSettings.uploading') : t('homepageSettings.uploadLogo')}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {t('homepageSettings.maxUploadSize', {
                              size: Math.round(MAX_SITE_LOGO_IMAGE_INPUT_SIZE / (1024 * 1024)),
                            })}
                          </p>
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleSiteLogoUpload(file);
                            }
                            event.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {logoPreviewUrl ? (
                      <button
                        type="button"
                        onClick={() => void persistSiteLogoSettings({
                          nextLogoUrl: null,
                          nextLogoPreviewUrl: null,
                          successMessage: t('homepageSettings.siteLogoRemoved'),
                        })}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('homepageSettings.removeImage')}
                      </button>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-6">
                    <h4 className="mb-4 text-sm font-semibold text-gray-900">{t('homepageSettings.faviconCardTitle')}</h4>
                    {faviconPreviewUrl ? (
                      <div
                        className="relative mb-4 overflow-hidden rounded-xl shadow-sm ring-1 ring-gray-900/5 h-32 w-full flex items-center justify-center p-4"
                        style={{
                          backgroundColor: '#ffffff',
                          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'24\' height=\'24\' viewBox=\'0 0 24 24\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 0h12v12H0zm12 12h12v12H12z\' fill=\'%23f3f4f6\' fill-rule=\'evenodd\'/%3E%3C/svg%3E")'
                        }}
                      >
                        <Image
                          src={faviconPreviewUrl}
                          alt="Favicon Preview"
                          width={64}
                          height={64}
                          unoptimized
                          className="object-contain max-h-16 max-w-16"
                        />
                      </div>
                    ) : null}

                    <div className="flex items-center justify-center">
                      <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white py-10 transition hover:border-[#FFC107] hover:bg-[#FFFDF7]">
                        <div className="rounded-full bg-gray-100 p-3 text-gray-500">
                          <UploadCloud className="h-6 w-6" />
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-gray-800">
                            {uploadingId === 'site-favicon' ? t('homepageSettings.uploading') : t('homepageSettings.uploadFavicon')}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {t('homepageSettings.faviconUploadHelp', {
                              size: Math.round(MAX_SITE_FAVICON_IMAGE_INPUT_SIZE / (1024 * 1024)),
                            })}
                          </p>
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleSiteFaviconUpload(file);
                            }
                            event.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {faviconPreviewUrl ? (
                      <button
                        type="button"
                        onClick={() => void persistSiteLogoSettings({
                          nextFaviconUrl: null,
                          nextFaviconPreviewUrl: null,
                          successMessage: t('homepageSettings.faviconRemoved'),
                        })}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('homepageSettings.removeImage')}
                      </button>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-gray-50/50 p-6">
                    <h4 className="mb-4 text-sm font-semibold text-gray-900">{t('homepageSettings.manifestIconCardTitle')}</h4>
                    {manifestIconPreviewUrl ? (
                      <div className="relative mb-4 overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-gray-900/5 h-32 w-full flex items-center justify-center p-4">
                        <Image
                          src={manifestIconPreviewUrl}
                          alt="Manifest Icon Preview"
                          width={96}
                          height={96}
                          unoptimized
                          className="object-contain max-h-24 max-w-24"
                        />
                      </div>
                    ) : null}

                    <div className="flex items-center justify-center">
                      <label className="flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 bg-white py-10 transition hover:border-[#FFC107] hover:bg-[#FFFDF7]">
                        <div className="rounded-full bg-gray-100 p-3 text-gray-500">
                          <UploadCloud className="h-6 w-6" />
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-gray-800">
                            {uploadingId === 'site-manifest-icon' ? t('homepageSettings.uploading') : t('homepageSettings.uploadManifestIcon')}
                          </p>
                          <p className="mt-1 text-xs text-gray-500">
                            {t('homepageSettings.manifestIconUploadHelp', {
                              size: Math.round(MAX_SITE_MANIFEST_ICON_IMAGE_INPUT_SIZE / (1024 * 1024)),
                            })}
                          </p>
                        </div>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (file) {
                              void handleSiteManifestIconUpload(file);
                            }
                            event.target.value = '';
                          }}
                        />
                      </label>
                    </div>

                    {manifestIconPreviewUrl ? (
                      <button
                        type="button"
                        onClick={() => void persistSiteLogoSettings({
                          nextManifestIconUrl: null,
                          nextManifestIconPreviewUrl: null,
                          successMessage: t('homepageSettings.manifestIconRemoved'),
                        })}
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 transition hover:bg-red-100"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t('homepageSettings.removeImage')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
