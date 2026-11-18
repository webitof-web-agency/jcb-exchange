import { z } from 'zod';
import {
  aiDataContractSchema,
  createAiDataErrorContractForCode,
  type AiDataContract,
} from './aiDataContract.service';
import type { AiToolExecutionResult } from './aiReadOnlyTools.service';

const aiGatewayResponseSchema = z.object({
  requestId: z.string().trim().min(1).max(160),
  provider: z.string().trim().min(1).max(80),
  model: z.string().trim().min(1).max(160),
  answer: z.string().trim().min(1).max(20_000),
}).strict();

export class AiResponseValidationError extends Error {
  public readonly statusCode = 502;
  public readonly code = 'AI_RESPONSE_INVALID';
  public readonly contract: AiDataContract<null> = createAiDataErrorContractForCode(this.code);

  constructor() {
    super('AI response validation failed.');
    this.name = 'AiResponseValidationError';
  }
}

export const validateAiGatewayResponse = <T extends object>(value: T) => {
  const parsed = aiGatewayResponseSchema.safeParse(value);
  if (!parsed.success) throw new AiResponseValidationError();
  return parsed.data;
};

export const validateAiToolResult = (value: AiToolExecutionResult): AiToolExecutionResult => {
  const parsed = aiDataContractSchema.safeParse(value.contract);
  if (!parsed.success) throw new AiResponseValidationError();

  const expectedAvailability = parsed.data.status === 'success' ? 'AVAILABLE' : parsed.data.status === 'empty' ? 'UNAVAILABLE' : null;
  if (expectedAvailability && value.dataAvailability !== expectedAvailability) {
    throw new AiResponseValidationError();
  }
  return value;
};

const GROUNDED_ENTITY_SIGNALS = /\b(?:sold|vehicle|vehicles|gaadi|gadi|deal|listing|listings|payment|payments|receipt|invoice|profit|loss|margin|finance|financial|customer|buyer|seller|partner|rto|document|documents|crm|lead|leads|task|tasks|recruitment|job|jobs|whatsapp|sms|analytics|report|status|data|record|account|ledger|tax|expense|revenue|gst|paisa|paise)\b|(?:वाहन|गाड़ी|गाड़ी|सौदा|डील|लिस्टिंग|भुगतान|रसीद|चालान|लाभ|घाटा|वित्त|ग्राहक|खरीदार|विक्रेता|साझेदार|दस्तावेज|रिपोर्ट|स्थिति|डेटा|रिकॉर्ड|खाता|खर्च|राजस्व|कर|संदेश)/iu;
const GROUNDED_QUESTION_SIGNALS = /\b(?:show|tell|give|find|check|verify|what|which|how|many|much|detail|details|status|data|report|summary|analytics|profit|loss|amount|total|count|batao|btao|dikhao|kitna|kitne|kitni|pura|complete|pending|history|kaise|kya)\b|(?:दिखा|बत|क्या|कितने|कितनी|कितना|विवरण|स्थिति|डेटा|रिपोर्ट|कुल|लंबित|इतिहास|कैसे)/iu;

export const requiresGroundedData = (
  message: string,
  pageContext: { recordId?: string | undefined } = {},
): boolean => Boolean(pageContext.recordId) || (
  GROUNDED_ENTITY_SIGNALS.test(message) && GROUNDED_QUESTION_SIGNALS.test(message)
);

export const groundedDataClarificationFor = (message: string): string => {
  if (/[\u0900-\u097f]/u.test(message)) {
    return 'Is request ka verified database record nahi mila, isliye main guess nahi karunga. Kripya exact deal, vehicle, listing ID ya report type bhejiye.';
  }
  if (/\b(?:batao|btao|dikhao|kitna|kitne|kitni|iska|iske)\b/iu.test(message)) {
    return 'Is request ke liye verified database result nahi mila, isliye main guess nahi karunga. Exact deal, vehicle, listing ID ya report type bhejiye.';
  }
  return 'I could not match this operational request to a verified database source, so I will not guess. Please provide an exact deal, vehicle, listing ID, or report type.';
};
