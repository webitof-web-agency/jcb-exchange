export type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: string };
};

export type SpeechRecognitionEventLike = Event & {
  resultIndex?: number;
  results: ArrayLike<{ isFinal: boolean; 0?: { transcript?: string } }>;
};

export type SpeechRecognitionErrorEventLike = Event & {
  error?: string;
};

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  start: () => void;
  stop: () => void;
};

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructor | null => {
  if (typeof window === 'undefined') return null;
  const browserWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
};

export const getVoiceInputErrorMessage = (errorCode?: string): string => {
  switch (errorCode) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'notallowederror':
      return 'Microphone access is blocked. Allow microphone access for this site and try again.';
    case 'audio-capture':
    case 'notfounderror':
    case 'notreadableerror':
      return 'No microphone was detected. Connect a microphone and try again.';
    case 'no-speech':
      return 'No speech was detected. Speak clearly and try again.';
    case 'network':
      return 'Voice recognition service is unavailable. Try again or type your question.';
    case 'aborted':
      return 'Voice input was stopped.';
    default:
      return 'Voice input could not be captured. Check microphone permission and try again.';
  }
};

export const getVoiceOutputButtonLabel = (isSpeaking: boolean, voiceOutputEnabled: boolean): string => {
  if (isSpeaking) return 'Stop';
  return voiceOutputEnabled ? 'Voice on' : 'Voice';
};

export const getVoiceInputStatusLabel = (isListening: boolean, isTranscribing: boolean): string => {
  if (isTranscribing) return 'Typing voice text';
  return isListening ? 'Listening · keep speaking' : 'Speak';
};

export const joinVoiceDraft = (prefix: string, committed: string, interim: string): string => [prefix, committed, interim]
  .map((value) => value.trim())
  .filter(Boolean)
  .join(' ');

export type SpeechVoiceCandidate = {
  name: string;
  lang: string;
  localService?: boolean;
};

export const choosePreferredSpeechVoice = <T extends SpeechVoiceCandidate>(
  voices: readonly T[],
  text: string,
): T | undefined => {
  if (!voices.length) return undefined;
  const hasDevanagari = /[\u0900-\u097F]/u.test(text);
  const preferredLanguages = hasDevanagari ? ['hi-IN', 'hi'] : ['en-IN', 'en-GB', 'en-US', 'en'];
  const naturalVoiceNames = /google|microsoft|natural|premium|neerja|heera|ravi|veena|aarav|aditi|samantha/iu;
  const scoreVoice = (voice: T) => {
    const language = voice.lang.toLowerCase();
    const languageIndex = preferredLanguages.findIndex((preferred) => language === preferred.toLowerCase());
    const baseLanguageIndex = preferredLanguages.findIndex((preferred) => language.startsWith(`${preferred.slice(0, 2).toLowerCase()}-`));
    return (languageIndex >= 0 ? 100 - languageIndex * 10 : baseLanguageIndex >= 0 ? 55 - baseLanguageIndex * 5 : 0)
      + (voice.localService ? 8 : 0)
      + (naturalVoiceNames.test(voice.name) ? 6 : 0);
  };

  return [...voices].sort((left, right) => scoreVoice(right) - scoreVoice(left))[0];
};

export const stripAiVoiceMarkup = (value: string): string => value
  .replace(/<[^>]*>/gu, ' ')
  .replace(/&nbsp;/giu, ' ')
  .replace(/&amp;/giu, '&')
  .replace(/&lt;/giu, '<')
  .replace(/&gt;/giu, '>')
  .replace(/\s+/gu, ' ')
  .replace(/\s+([.,!?;:])/gu, '$1')
  .trim();
