"use client";

import Image from 'next/image';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Package, Calendar, MapPin, ExternalLink, Image as ImageIcon, Edit, Trash2 } from 'lucide-react';
import axios from 'axios';
import api, { getAbsoluteMediaUrl } from '@/lib/api';
import SellVehicleModal, { type EditableListing } from '@/components/sell/SellVehicleModal';
import CustomerPrimePaymentModal from '@/components/payments/CustomerPrimePaymentModal';
import { useToastStore } from '@/store/toastStore';
import { generateMachineSlugPath } from '@/lib/seoUtils';
import { generateProfileListingDetailPath } from '@/lib/privateRoutePaths';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/hooks/useTranslation';

type ListingItem = {
  id: string;
  title?: string | null;
  media?: Array<{
    id?: string;
    url: string;
    type?: string;
    isFeatured?: boolean;
  }> | null;
  brand?: { id?: string; name?: string | null } | null;
  model?: { id?: string; name?: string | null } | null;
  status?: string | null;
  isPubliclyVisible?: boolean;
  manufacturingYear?: number | null;
  locationCity?: string | null;
  locationState?: string | null;
  price?: string | number | null;
};

const formatPrice = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') {
    return 'Price on Request';
  }

  const numericValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numericValue)) {
    return 'Price on Request';
  }

  return `₹${numericValue.toLocaleString('en-IN')}`;
};

const getListingTitle = (listing: ListingItem) => {
  const composedTitle = [listing.brand?.name, listing.model?.name].filter(Boolean).join(' ').trim();
  return listing.title || composedTitle || 'Untitled listing';
};

const getListingImage = (listing: ListingItem) => {
  const featuredImage = listing.media?.find((item) => item.isFeatured && item.url);
  return featuredImage?.url || listing.media?.[0]?.url || null;
};

const getStatusClassName = (status?: string | null) => {
  const normalized = String(status || '').toUpperCase();

  if (['PUBLISHED', 'APPROVED', 'AVAILABLE', 'ACTIVE'].includes(normalized)) {
    return 'text-green-600';
  }

  if (['PENDING', 'PENDING_APPROVAL', 'DRAFT'].includes(normalized)) {
    return 'text-yellow-600';
  }

  return 'text-red-600';
};

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.response?.data?.message || fallback;
  }

  return error instanceof Error ? error.message : fallback;
};

const isSoldListing = (status?: string | null) => String(status || '').toUpperCase() === 'SOLD';

export default function MyListingsTab() {
  const { t } = useTranslation();
  const [listings, setListings] = useState<ListingItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [listingToEdit, setListingToEdit] = useState<EditableListing | null>(null);
  const [loadingEditId, setLoadingEditId] = useState<string | null>(null);
  
  // Delete Modal states
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [listingToDelete, setListingToDelete] = useState<string | null>(null);
  const showToast = useToastStore((state) => state.showToast);
  const { user } = useAuthStore();
  const [isPrimePaymentOpen, setIsPrimePaymentOpen] = useState(false);
  const isCustomerUser = user?.role === 'CUSTOMER';

  const fetchListings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get<{ listings?: ListingItem[] }>('/listings');
      setListings(response.data.listings || []);
    } catch (error) {
      console.error('Failed to fetch listings', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchListings();
  }, [fetchListings]);

  const handleOpenNewListing = () => {
    setListingToEdit(null);
    if (user?.role === 'CUSTOMER') {
      setIsPrimePaymentOpen(true);
      return;
    }

    setIsModalOpen(true);
  };

  const handleEditListing = async (listingId: string) => {
    const listing = listings.find((item) => item.id === listingId);
    if (isCustomerUser && isSoldListing(listing?.status)) {
      showToast({
        title: t('profile.soldListingViewOnly'),
        description: t('profile.soldListingEditLocked'),
        variant: 'error',
      });
      return;
    }

    try {
      setLoadingEditId(listingId);
      const response = await api.get<{ listing: EditableListing }>(`/listings/${listingId}`);
      setListingToEdit(response.data.listing);
      setIsModalOpen(true);
    } catch (error: unknown) {
      console.error('Failed to load listing for editing', error);
      showToast({
        title: t('profile.loadListingFailed'),
        description: getApiErrorMessage(error, t('profile.loadListingFailed')),
        variant: 'error',
      });
    } finally {
      setLoadingEditId(null);
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setListingToEdit(null);
    fetchListings(); // Refresh listings after adding/editing
  };

  const handleDeleteListing = async () => {
    if (!listingToDelete) return;

    const listing = listings.find((item) => item.id === listingToDelete);
    if (isCustomerUser && isSoldListing(listing?.status)) {
      showToast({
        title: t('profile.soldListingViewOnly'),
        description: t('profile.soldListingDeleteLocked'),
        variant: 'error',
      });
      setIsDeleteModalOpen(false);
      setListingToDelete(null);
      return;
    }
    
    try {
      setLoading(true);
      await api.delete(`/listings/${listingToDelete}`);
      showToast({
        title: t('profile.listingDeleted'),
        description: t('profile.listingDeletedDescription'),
        variant: 'success',
      });
      setIsDeleteModalOpen(false);
      setListingToDelete(null);
      fetchListings();
    } catch (error: unknown) {
      console.error('Failed to delete listing', error);
      showToast({
        title: t('profile.deleteFailed'),
        description: getApiErrorMessage(error, t('profile.deleteFailed')),
        variant: 'error',
      });
      setLoading(false);
    }
  };

  if (loading && listings.length === 0) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#FFC107] border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <div className="rounded-xl sm:rounded-2xl bg-white p-5 sm:p-8 shadow-sm sm:shadow-xl sm:shadow-gray-200/50 border border-gray-100 sm:border-0">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-5 sm:pb-6 gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{t('profile.myListings')}</h2>
            <p className="mt-1 text-sm text-gray-500">{t('profile.myListingsDescription')}</p>
          </div>
          <button
            onClick={handleOpenNewListing}
            className="w-full sm:w-auto rounded-lg bg-[#FFC107] px-4 py-2.5 sm:py-2 text-sm font-bold text-black transition-colors hover:bg-yellow-400 text-center"
          >
            {t('profile.sellVehicle')}
          </button>
        </div>

        {listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50">
              <Package className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">{t('profile.noListingsFound')}</h3>
            <p className="mt-2 max-w-sm text-sm text-gray-500">
              {t('profile.noListingsDescription')}
            </p>
          </div>
        ) : (
          <div className="max-h-[65vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
            {listings.map((listing) => {
              const title = getListingTitle(listing);
              const imageUrl = getListingImage(listing);
              const locationLabel = [listing.locationCity, listing.locationState].filter(Boolean).join(', ');
              const isReadOnlySoldListing = isCustomerUser && isSoldListing(listing.status);

              return (
                <div key={listing.id} className="group overflow-hidden rounded-xl border border-gray-100 bg-white transition-all hover:border-gray-200 hover:shadow-lg">
                  <Link href={generateProfileListingDetailPath(listing)} className="relative block aspect-video w-full overflow-hidden bg-gray-100">
                    {imageUrl ? (
                      <Image
                        src={getAbsoluteMediaUrl(imageUrl)}
                        alt={title}
                        fill
                        unoptimized
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <ImageIcon className="h-10 w-10 text-gray-300" />
                      </div>
                    )}

                    <div className="absolute right-3 top-3 rounded-md bg-white/90 px-2.5 py-1 text-xs font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm">
                      <span className={getStatusClassName(listing.status)}>{String(listing.status || 'UNKNOWN')}</span>
                    </div>
                  </Link>

                  <div className="p-5">
                    <h3 className="truncate text-lg font-bold text-gray-900">{title}</h3>

                    <div className="mt-3 flex flex-col gap-2 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <span>
                          {t('profile.manufacturingYear', {
                            value: listing.manufacturingYear || t('profile.notSpecified'),
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400" />
                        <span className="truncate">{locationLabel || t('machines.locationNotSpecified')}</span>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-gray-50 pt-4">
                      <span className="text-lg font-bold text-[#FFC107]">{formatPrice(listing.price)}</span>

                      <div className="flex items-center gap-3">
                        {!isReadOnlySoldListing ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleEditListing(listing.id)}
                              disabled={loadingEditId === listing.id}
                              className="flex items-center gap-1 text-sm font-semibold text-gray-500 transition-colors hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Edit className="h-4 w-4" />
                              {loadingEditId === listing.id ? t('profile.loading') : null}
                            </button>

                            <button
                              onClick={() => {
                                setListingToDelete(listing.id);
                                setIsDeleteModalOpen(true);
                              }}
                              className="flex items-center gap-1 text-sm font-semibold text-gray-500 transition-colors hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                            {t('profile.soldListingViewOnly')}
                          </span>
                        )}

                        <div className="flex items-center gap-2">
                          <Link
                            href={generateProfileListingDetailPath(listing)}
                            className="text-sm font-semibold text-gray-500 transition-colors hover:text-gray-900"
                          >
                            {t('profile.viewDetails')}
                          </Link>
                          
                          {listing.isPubliclyVisible !== false ? (
                            <Link
                              href={generateMachineSlugPath(listing)}
                              target="_blank"
                              title={t('profile.openPublicPage')}
                              className="flex items-center justify-center rounded-md p-1.5 text-[#FFC107] transition-colors hover:bg-yellow-50 hover:text-yellow-600"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
      
      {/* Dynamic Modal Render */}
      {isModalOpen && (
        <SellVehicleModal 
          isOpen={isModalOpen} 
          onClose={handleModalClose} 
          listingToEdit={listingToEdit} 
        />
      )}

      {isPrimePaymentOpen ? (
        <CustomerPrimePaymentModal
          isOpen={isPrimePaymentOpen}
          feature="SELL_LISTING"
          onClose={() => setIsPrimePaymentOpen(false)}
          onAccessGranted={() => {
            setIsPrimePaymentOpen(false);
            setIsModalOpen(true);
          }}
        />
      ) : null}

      {/* Delete Confirmation Modal */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">{t('profile.deleteListing')}</h3>
            <p className="mt-2 text-sm text-gray-500">
              {t('profile.deleteListingConfirm')}
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setListingToDelete(null);
                }}
                className="rounded-lg px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                disabled={loading}
              >
                {t('profile.cancel')}
              </button>
              <button
                onClick={handleDeleteListing}
                className="flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 transition-colors"
                disabled={loading}
              >
                {loading ? t('profile.deleting') : t('profile.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
