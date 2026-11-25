'use client';

import Image from 'next/image';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PlayCircle,
  Sparkles,
  X,
} from 'lucide-react';
import { getSellVehicleSampleMedia } from '@/lib/sellVehicleSampleMedia.mjs';

export type SampleGuideMediaSlot<T extends string = string> = {
  key: T;
  label: string;
  kind: 'image' | 'video';
};

type SampleMediaDetails = {
  kind: 'image' | 'video';
  src: string;
  title: string;
  titleHi?: string;
  subtitle: string;
  subtitleHi?: string;
  required?: boolean;
  angle: string;
  angleHi?: string;
  distance: string;
  distanceHi?: string;
  guideNote: string;
  guideNoteHi?: string;
  tips?: string[];
  tipsHi?: string[];
};

export default function MediaSampleGuideModal<T extends string>({
  slotKey,
  mediaSlots,
  onChangeSlot,
}: {
  slotKey: T | null;
  mediaSlots: readonly SampleGuideMediaSlot<T>[];
  onChangeSlot: (nextSlotKey: T | null) => void;
}) {
  const [guideLanguage, setGuideLanguage] = useState<'both' | 'en' | 'hi'>('both');

  if (!slotKey || typeof window === 'undefined') {
    return null;
  }

  const activeSampleMedia = getSellVehicleSampleMedia(slotKey) as SampleMediaDetails | null;
  if (!activeSampleMedia) {
    return null;
  }

  const activeSlotIndex = mediaSlots.findIndex((s) => s.key === slotKey);
  const handlePrevSample = () => {
    if (!mediaSlots.length) return;
    if (activeSlotIndex > 0) {
      onChangeSlot(mediaSlots[activeSlotIndex - 1].key);
    } else {
      onChangeSlot(mediaSlots[mediaSlots.length - 1].key);
    }
  };
  const handleNextSample = () => {
    if (!mediaSlots.length) return;
    if (activeSlotIndex >= 0 && activeSlotIndex < mediaSlots.length - 1) {
      onChangeSlot(mediaSlots[activeSlotIndex + 1].key);
    } else {
      onChangeSlot(mediaSlots[0].key);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999999] flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => onChangeSlot(null)}
    >
      <div
        className="relative flex flex-col w-full max-w-5xl xl:max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-gray-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/90 px-4 sm:px-5 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-700 shrink-0">
              {activeSampleMedia.kind === 'video' ? (
                <PlayCircle className="h-4 w-4" />
              ) : (
                <Camera className="h-4 w-4" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h3 className="text-sm sm:text-base font-bold text-gray-900">
                  {guideLanguage === 'hi'
                    ? activeSampleMedia.titleHi || activeSampleMedia.title
                    : guideLanguage === 'en'
                    ? activeSampleMedia.title
                    : `${activeSampleMedia.title} (${activeSampleMedia.titleHi || activeSampleMedia.title})`}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    activeSampleMedia.required
                      ? 'bg-rose-50 text-rose-700 border border-rose-200'
                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                  }`}
                >
                  {activeSampleMedia.required
                    ? guideLanguage === 'hi'
                      ? 'आवश्यक'
                      : guideLanguage === 'en'
                      ? 'Required'
                      : 'Required / जरूरी'
                    : guideLanguage === 'hi'
                    ? 'अनुशंसित'
                    : guideLanguage === 'en'
                    ? 'Recommended'
                    : 'Recommended / अनुशंसित'}
                </span>
              </div>
              <p className="text-[11px] text-gray-500 font-medium">
                {guideLanguage === 'hi'
                  ? activeSampleMedia.subtitleHi || activeSampleMedia.subtitle
                  : guideLanguage === 'en'
                  ? activeSampleMedia.subtitle
                  : `${activeSampleMedia.subtitle} • ${activeSampleMedia.subtitleHi || ''}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Switcher */}
            <div className="hidden xs:flex sm:flex items-center rounded-lg border border-gray-200 bg-gray-100 p-0.5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setGuideLanguage('both')}
                className={`px-2 py-0.5 rounded-md text-[11px] transition cursor-pointer ${
                  guideLanguage === 'both' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                हिंदी + EN
              </button>
              <button
                type="button"
                onClick={() => setGuideLanguage('hi')}
                className={`px-2 py-0.5 rounded-md text-[11px] transition cursor-pointer ${
                  guideLanguage === 'hi' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                हिंदी
              </button>
              <button
                type="button"
                onClick={() => setGuideLanguage('en')}
                className={`px-2 py-0.5 rounded-md text-[11px] transition cursor-pointer ${
                  guideLanguage === 'en' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                English
              </button>
            </div>

            <button
              type="button"
              onClick={() => onChangeSlot(null)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-200/80 hover:text-gray-700 transition cursor-pointer"
              aria-label="Close guide"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Left Media Preview + Right Guide Details */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {/* Visual Preview */}
            <div className="md:col-span-7 flex flex-col gap-2">
              <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl bg-gray-950 border border-gray-800 shadow-md flex items-center justify-center">
                {activeSampleMedia.kind === 'video' ? (
                  <video
                    src={activeSampleMedia.src}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Image
                    src={activeSampleMedia.src}
                    alt={activeSampleMedia.title}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                )}

                {/* Angle / Distance Badge Overlay */}
                <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-0.5 rounded-md bg-black/80 backdrop-blur-xs px-2.5 py-1 text-[10px] font-bold text-white shadow-xs">
                  <div>
                    Angle: {activeSampleMedia.angle}
                    {guideLanguage !== 'en' && activeSampleMedia.angleHi ? (
                      <span className="text-amber-300 font-normal ml-1">({activeSampleMedia.angleHi})</span>
                    ) : null}
                  </div>
                  <div>
                    Distance: {activeSampleMedia.distance}
                    {guideLanguage !== 'en' && activeSampleMedia.distanceHi ? (
                      <span className="text-amber-300 font-normal ml-1">({activeSampleMedia.distanceHi})</span>
                    ) : null}
                  </div>
                </div>

                <div className="absolute bottom-2.5 right-2.5 z-10 rounded-md bg-emerald-600/95 backdrop-blur-xs px-2 py-0.5 text-[10px] font-bold text-white shadow-xs flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>
                    {guideLanguage === 'hi'
                      ? 'वेरीफाइड संदर्भ फोटो'
                      : guideLanguage === 'en'
                      ? 'Verified Reference Sample'
                      : 'Verified Reference / वेरीफाइड संदर्भ'}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-center text-gray-500 italic">
                {guideLanguage === 'hi'
                  ? 'ऊपर दिया गया सैंपल फोटो सही एंगल, फ्रेमिंग और पर्याप्त रोशनी को दर्शाता है।'
                  : guideLanguage === 'en'
                  ? 'Above preview demonstrates the ideal angle, framing, and lighting for this upload slot.'
                  : 'Above preview demonstrates ideal angle & lighting. / ऊपर दिया गया सैंपल सही एंगल व फ्रेमिंग दर्शाता है।'}
              </p>
            </div>

            {/* Guide Notes & Inspection Checklist */}
            <div className="md:col-span-5 space-y-3">
              {/* Guide Note Card */}
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2 shadow-2xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900 flex items-center gap-1">
                  <Sparkles className="h-3 w-3 text-amber-600" />
                  {guideLanguage === 'hi'
                    ? 'फोटो कैसे खींचें (निर्देश)'
                    : guideLanguage === 'en'
                    ? 'WHAT TO CAPTURE'
                    : 'WHAT TO CAPTURE / फोटो कैसे खींचें'}
                </span>
                {(guideLanguage === 'both' || guideLanguage === 'en') && (
                  <p className="text-xs text-gray-800 leading-relaxed font-medium">
                    {activeSampleMedia.guideNote}
                  </p>
                )}
                {(guideLanguage === 'both' || guideLanguage === 'hi') && activeSampleMedia.guideNoteHi && (
                  <p
                    className={`text-xs text-amber-950 leading-relaxed font-semibold ${
                      guideLanguage === 'both' ? 'pt-1.5 border-t border-amber-200/70' : ''
                    }`}
                  >
                    {guideLanguage === 'both' && (
                      <span className="text-[10px] text-amber-700 font-bold block mb-0.5">🇮🇳 हिंदी निर्देश:</span>
                    )}
                    {activeSampleMedia.guideNoteHi}
                  </p>
                )}
              </div>

              {/* Pro Tips / Checklist Card */}
              <div className="rounded-xl border border-gray-200 bg-white p-3 space-y-2 shadow-2xs">
                <span className="text-[11px] font-bold text-gray-900 flex items-center gap-1">
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  {guideLanguage === 'hi'
                    ? 'जरूरी टिप्स व जांच'
                    : guideLanguage === 'en'
                    ? 'Inspection & Quality Tips'
                    : 'Inspection & Quality Tips / जरूरी टिप्स'}
                </span>
                <ul className="space-y-2">
                  {activeSampleMedia.tips?.map((tip: string, idx: number) => {
                    const tipHi = activeSampleMedia.tipsHi?.[idx];
                    return (
                      <li key={idx} className="flex items-start gap-2 text-xs">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <div className="space-y-0.5">
                          {(guideLanguage === 'both' || guideLanguage === 'en') && (
                            <span className="text-gray-800 font-medium block">{tip}</span>
                          )}
                          {(guideLanguage === 'both' || guideLanguage === 'hi') && tipHi && (
                            <span className="text-emerald-900 font-semibold block text-[11px]">{tipHi}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Technical Spec Box */}
              <div className="rounded-xl border border-gray-100 bg-gray-50/80 p-2.5 flex items-center justify-between text-[11px] text-gray-600">
                <span>
                  <strong className="text-gray-800">{guideLanguage === 'hi' ? 'मान्य फॉर्मेट:' : 'Allowed / मान्य:'}</strong>{' '}
                  {activeSampleMedia.kind === 'video' ? 'MP4, WebM (Max 120s)' : 'JPG, PNG, WebP (Max 5MB)'}
                </span>
                <span className="font-bold text-amber-800 bg-amber-100/70 px-2 py-0.5 rounded">
                  {guideLanguage === 'hi'
                    ? 'लैंडस्केप मोड (आड़ा)'
                    : guideLanguage === 'en'
                    ? 'Landscape Mode'
                    : 'Landscape Mode / लैंडस्केप'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer: Prev / Next / Close */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50/80 px-4 sm:px-5 py-3">
          <button
            type="button"
            onClick={handlePrevSample}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>{guideLanguage === 'hi' ? 'पिछला' : guideLanguage === 'en' ? 'Previous' : 'Previous / पिछला'}</span>
          </button>

          <span className="text-xs font-bold text-gray-600">
            Slot {activeSlotIndex + 1} of {mediaSlots.length}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNextSample}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
            >
              <span>{guideLanguage === 'hi' ? 'अगला' : guideLanguage === 'en' ? 'Next' : 'Next / अगला'}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onChangeSlot(null)}
              className="rounded-lg bg-gray-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-gray-800 transition cursor-pointer shadow-xs"
            >
              {guideLanguage === 'hi' ? 'समझ गया, बंद करें' : guideLanguage === 'en' ? 'Got it, Close' : 'Got it, Close / समझ गया'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
