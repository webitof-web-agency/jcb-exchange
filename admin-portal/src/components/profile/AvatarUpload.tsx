'use client';

import { useRef, useState } from 'react';
import { Camera, LoaderCircle, Trash2 } from 'lucide-react';
import type { AxiosError } from 'axios';
import api, { API_ORIGIN } from '@/lib/api';
import { compressAvatarImage } from '@/lib/avatarUpload';
import type { User } from '@/store/authStore';

type AvatarUploadProps = {
  user: User | null;
  onUploaded: (user: User) => void;
  size?: 'header' | 'profile' | 'header-compact';
};

const getAvatarUrl = (avatarUrl?: string | null) => {
  if (!avatarUrl) return '';
  if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
  return `${API_ORIGIN}${avatarUrl.startsWith('/') ? avatarUrl : `/${avatarUrl}`}`;
};

const getInitials = (user: User | null) =>
  (user?.name || user?.email || 'U')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || 'U';

const getErrorMessage = (error: unknown) => {
  const axiosError = error as AxiosError<{ error?: string }>;
  return axiosError.response?.data?.error || (error instanceof Error ? error.message : 'Unable to update avatar.');
};

export function UserAvatar({ user, size = 'header' }: Omit<AvatarUploadProps, 'onUploaded'>) {
  const sizeClass =
    size === 'profile'
      ? 'h-20 w-20 rounded-2xl text-2xl font-black'
      : size === 'header-compact'
        ? 'h-7.5 w-7.5 rounded-full text-[11px] font-black'
        : 'h-8.5 w-8.5 sm:h-9 sm:w-9 rounded-full text-xs font-black';
  const avatarUrl = getAvatarUrl(user?.avatarUrl);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-amber-100 via-amber-200 to-amber-300 text-amber-950 border border-amber-300/80 shadow-2xs font-black select-none ${sizeClass}`}
    >
      {avatarUrl ? (
        // Avatar URLs are runtime-configured by the API, so Next image domains are not static here.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt={`${user?.name || 'User'} avatar`} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true" className="tracking-tight">{getInitials(user)}</span>
      )}
    </div>
  );
}

export default function AvatarUpload({ user, onUploaded, size = 'profile' }: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const compressedFile = await compressAvatarImage(file);
      const formData = new FormData();
      formData.append('file', compressedFile);
      const response = await api.patch('/auth/profile/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (!response.data?.user) {
        throw new Error('Avatar update response was incomplete.');
      }
      onUploaded(response.data.user as User);
    } catch (uploadError: unknown) {
      setError(getErrorMessage(uploadError));
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!user?.avatarUrl || typeof window === 'undefined') return;
    if (!window.confirm('Remove your profile photo?')) return;

    setError(null);
    setRemoving(true);
    try {
      const response = await api.delete('/auth/profile/avatar');
      if (!response.data?.user) {
        throw new Error('Avatar removal response was incomplete.');
      }
      onUploaded(response.data.user as User);
    } catch (removeError: unknown) {
      setError(getErrorMessage(removeError));
    } finally {
      setRemoving(false);
    }
  };

  const busy = uploading || removing;

  return (
    <div className="relative inline-flex flex-col items-center">
      <div
        className={`relative group ${!busy ? 'cursor-pointer' : ''}`}
        onClick={() => !busy && inputRef.current?.click()}
        title={user?.avatarUrl ? 'Click to change photo' : 'Click to upload photo'}
      >
        <UserAvatar user={user} size={size} />
        {!busy ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100 text-white">
            <Camera className="h-6 w-6 drop-shadow-sm" />
          </div>
        ) : null}
        {busy ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-[inherit] bg-black/60 text-white">
            <LoaderCircle className="h-6 w-6 animate-spin text-[#FFC107]" aria-label={removing ? 'Removing avatar' : 'Uploading avatar'} />
          </div>
        ) : null}

        {/* Action buttons: Compact overlay badge at bottom-right of avatar */}
        <div className="absolute -bottom-1 -right-1 flex items-center gap-1 z-10" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            title="Upload / Change photo (JPG, PNG, WEBP · max 2 MB)"
            aria-label="Upload photo"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-700 shadow-md transition hover:border-[#FFC107] hover:bg-[#FFC107] hover:text-black focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-gray-800" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
          </button>

          {user?.avatarUrl ? (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              title="Remove photo"
              aria-label="Remove photo"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 shadow-md transition hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {removing ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin text-red-600" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />

      {error ? (
        <p className="max-w-48 text-center text-xs font-medium text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
