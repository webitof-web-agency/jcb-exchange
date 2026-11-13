import assert from 'node:assert/strict';
import test from 'node:test';
import { choosePreferredSpeechVoice, getVoiceInputErrorMessage, getVoiceInputStatusLabel, getVoiceOutputButtonLabel, joinVoiceDraft, stripAiVoiceMarkup } from './aiVoice';

test('voice output control shows Stop while a response is speaking', () => {
  assert.equal(getVoiceOutputButtonLabel(true, true), 'Stop');
});

test('voice input status distinguishes listening from live transcription', () => {
  assert.equal(getVoiceInputStatusLabel(true, false), 'Listening · keep speaking');
  assert.equal(getVoiceInputStatusLabel(true, true), 'Typing voice text');
});

test('voice output strips markup and collapses whitespace', () => {
  assert.equal(
    stripAiVoiceMarkup('<p>Listing <strong>approved</strong>.</p><ul><li>Count: 3</li></ul>'),
    'Listing approved. Count: 3',
  );
});

test('voice permission errors give an actionable message', () => {
  assert.equal(
    getVoiceInputErrorMessage('not-allowed'),
    'Microphone access is blocked. Allow microphone access for this site and try again.',
  );
});

test('voice capture errors explain when no microphone is available', () => {
  assert.equal(
    getVoiceInputErrorMessage('audio-capture'),
    'No microphone was detected. Connect a microphone and try again.',
  );
});

test('voice draft preserves the typed prefix and separates final/interim speech', () => {
  assert.equal(
    joinVoiceDraft('Raipur listings', 'JCB available', 'batao'),
    'Raipur listings JCB available batao',
  );
});

test('speech voice selection prefers a local Indian voice for the response language', () => {
  const voices = [
    { name: 'English United States', lang: 'en-US', localService: true },
    { name: 'Google Hindi', lang: 'hi-IN', localService: true },
    { name: 'English India', lang: 'en-IN', localService: true },
  ];

  assert.equal(choosePreferredSpeechVoice(voices, 'आपकी listing तैयार है')?.name, 'Google Hindi');
  assert.equal(choosePreferredSpeechVoice(voices, 'Your listing is ready')?.name, 'English India');
});
