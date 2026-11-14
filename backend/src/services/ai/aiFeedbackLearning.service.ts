import prisma from '../../lib/prisma';
import { redactSensitiveData } from './aiRedaction';

type FeedbackSignal = { rating: number; commentRedacted?: string | null; comment?: string | null };

export type AiFeedbackLearningRepository = {
  listRecentLowRatings: (actorUserId: string) => Promise<FeedbackSignal[]>;
};

const GUIDANCE = {
  accuracy: 'Prefer verified source data and explicitly state uncertainty when evidence is missing.',
  concise: 'Keep answers concise and directly answer the operator request.',
  privacy: 'Minimize personal and sensitive details; use safe business fields only.',
  grounding: 'Use the current approved tool or knowledge source instead of relying on an older conversation claim.',
} as const;

const defaultRepository: AiFeedbackLearningRepository = {
  async listRecentLowRatings(actorUserId) {
    return prisma.aiFeedback.findMany({
      where: { actorUserId, rating: { lte: 2 } },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { rating: true, commentRedacted: true },
    });
  },
};

const commentText = (value: string | null | undefined) => redactSensitiveData(value || '').toLocaleLowerCase('en-IN');

export const buildFeedbackGuidance = (feedback: readonly FeedbackSignal[]): string[] => {
  const guidance = new Set<string>();
  for (const item of feedback) {
    if (item.rating > 2) continue;
    const comment = commentText(item.commentRedacted ?? item.comment);
    if (/wrong|incorrect|गलत|unavailable|missing|not\s+found|guess/u.test(comment)) guidance.add(GUIDANCE.accuracy);
    if (/short|concise|long|verbose|brief|shorter|कम\s+शब्द/u.test(comment)) guidance.add(GUIDANCE.concise);
    if (/pii|private|personal|secret|mobile|email|credential|sensitive|expos/u.test(comment)) guidance.add(GUIDANCE.privacy);
    if (/old|stale|previous|source|evidence|ground/u.test(comment)) guidance.add(GUIDANCE.grounding);
  }
  return [...guidance].slice(0, 4);
};

export class AiFeedbackLearningService {
  constructor(private readonly repository: AiFeedbackLearningRepository = defaultRepository) {}

  async contextFor(actorUserId: string): Promise<string[]> {
    const normalized = actorUserId.trim();
    if (!normalized) return [];
    return buildFeedbackGuidance(await this.repository.listRecentLowRatings(normalized));
  }
}

export const aiFeedbackLearningService = new AiFeedbackLearningService();
