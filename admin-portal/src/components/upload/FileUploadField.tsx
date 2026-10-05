'use client';

import Image from 'next/image';
import { useEffect, useId, useRef, useState } from 'react';
import {
  getPdfUploadValidationError,
  getUploadValidationError,
  type UploadVisibility,
  type UploadedFileResult,
  uploadFileToServer,
} from '@/lib/fileUpload';
import api from '@/lib/api';
import { normalizeSecureDocumentPath } from '@/lib/secureDocumentPath.mjs';
import { useTranslation } from '@/hooks/useTranslation';

type FileUploadFieldProps = {
  accept: string;
  disabled?: boolean;
  helperText?: string;
  labelIdle?: string;
  onUploaded: (file: UploadedFileResult) => void;
  onUploadStateChange?: (uploading: boolean) => void;
  uploadedFileName?: string | null;
  uploadedFileMimeType?: string | null;
  uploadedFileUrl?: string | null;
  pdfOnly?: boolean;
  visibility: UploadVisibility;
};

export function FileUploadField({
  accept,
  disabled = false,
  helperText,
  labelIdle = 'No file uploaded yet.',
  onUploaded,
  onUploadStateChange,
  pdfOnly = false,
  uploadedFileName,
  uploadedFileMimeType,
  uploadedFileUrl,
  visibility,
}: FileUploadFieldProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [imagePreview, setImagePreview] = useState({ source: '', url: '' });
  const isImage = uploadedFileMimeType?.startsWith('image/') || /\.(?:jpe?g|png|webp|gif)$/i.test(uploadedFileName || '');

  useEffect(() => {
    if (!uploadedFileUrl || !isImage) {
      return;
    }

    let cancelled = false;
    let objectUrl = '';
    const loadPreview = async () => {
      try {
        const response = await api.get(normalizeSecureDocumentPath(uploadedFileUrl), { responseType: 'blob' });
        const previewMimeType = uploadedFileMimeType?.startsWith('image/')
          ? uploadedFileMimeType
          : response.data.type?.startsWith('image/') ? response.data.type : 'image/*';
        objectUrl = URL.createObjectURL(new Blob([response.data], { type: previewMimeType }));
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
        } else {
          setImagePreview({ source: uploadedFileUrl, url: objectUrl });
        }
      } catch {
        if (!cancelled) {
          setImagePreview({ source: uploadedFileUrl, url: '' });
        }
      }
    };

    void loadPreview();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isImage, uploadedFileMimeType, uploadedFileUrl]);

  const imagePreviewUrl = imagePreview.source === uploadedFileUrl ? imagePreview.url : '';

  const handleChange = async (file?: File) => {
    if (!file) {
      return;
    }

    setError('');

    const validationError = pdfOnly ? getPdfUploadValidationError(file) : getUploadValidationError(file);
    if (validationError) {
      setError(validationError);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    setUploading(true);
    onUploadStateChange?.(true);

    try {
      const uploadedFile = await uploadFileToServer({ file, visibility });
      onUploaded(uploadedFile);
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : 'Unable to upload the selected file.';
      setError(message);
    } finally {
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      setUploading(false);
      onUploadStateChange?.(false);
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        disabled={disabled || uploading}
        onChange={(event) => void handleChange(event.target.files?.[0])}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={[helperText ? helperId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}
        className={`w-full rounded-lg border bg-[#F5F8FA] px-3 py-3 text-sm text-gray-900 outline-none transition disabled:cursor-not-allowed disabled:bg-gray-100 ${
          error ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#FFC107]'
        }`}
      />

      {uploading ? <p className="text-xs text-[#9a7600]">{t('listingDetails.uploading', 'Uploading...')}</p> : null}
      {helperText ? (
        <p id={helperId} className="text-xs text-gray-500">
          {helperText}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}

      {uploadedFileUrl ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-emerald-700">{t('verificationDetails.uploadedFile', 'Uploaded file')}: {uploadedFileName || t('common.notAvailable', 'Document')}</p>
          {isImage ? (
            imagePreviewUrl ? (
              <Image
                src={imagePreviewUrl}
                alt={uploadedFileName || t('common.documentPreview', 'Uploaded document preview')}
                width={640}
                height={320}
                unoptimized
                className="max-h-40 w-full rounded-lg border border-gray-200 bg-white object-contain p-1"
              />
            ) : <p className="text-xs text-gray-500">{t('common.loadingPreview', 'Loading preview...')}</p>
          ) : null}
        </div>
      ) : null}

      {!uploadedFileUrl && <p className="text-xs text-gray-500">{labelIdle}</p>}
    </div>
  );
}
