'use client';

type AiOperatorDataProps = {
  data: unknown;
};

/**
 * Technical operational metadata should not be dumped as raw JSON into the operator's chat window.
 * The AI responds in natural, human-readable text directly (ChatGPT style).
 */
export default function AiOperatorData({ data: _data }: AiOperatorDataProps) {
  return null;
}
