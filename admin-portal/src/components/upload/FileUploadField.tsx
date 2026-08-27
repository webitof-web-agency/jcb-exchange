'use client';

import { useId, useRef, useState } from 'react';
import {
  getUploadValidationError,
  type UploadVisibility,
  type UploadedFileResult,
  uploadFileToServer,
} from '@/lib/fileUpload';

type FileUploadFieldProps = {
  accept: string;
  disabled?: boolean;
  helperText?: string;
  labelIdle?: string;
  onUploaded: (file: UploadedFileResult) => void;
  uploadedFileName?: string | null;
  uploadedFileUrl?: string | null;
  visibility: UploadVisibility;
};

export function FileUploadField({
  accept,
  disabled = false,
  helperText,
  labelIdle = 'No file uploaded yet.',
  onUploaded,
  uploadedFileUrl,
  visibility,
}: FileUploadFieldProps) {
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const helperId = `${inputId}-helper`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = async (file?: File) => {
    if (!file) {
      return;
    }

    setError('');

    const validationError = getUploadValidationError(file);
    if (validationError) {
      setError(validationError);
      if (inputRef.current) {
        inputRef.current.value = '';
      }
      return;
    }

    setUploading(true);

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

      {uploading ? <p className="text-xs text-[#9a7600]">Uploading and optimizing file...</p> : null}
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

      {!uploadedFileUrl && <p className="text-xs text-gray-500">{labelIdle}</p>}
    </div>
  );
}
