import type { Response } from 'express';

export type RealtimeNotification = {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: string | null;
  isRead: boolean;
  link: string | null;
  createdAt: Date | string;
};

const subscribers = new Map<string, Set<Response>>();

const serialise = (value: RealtimeNotification) => JSON.stringify({
  ...value,
  createdAt: value.createdAt instanceof Date ? value.createdAt.toISOString() : value.createdAt,
});

/** Keeps one authenticated browser connection per portal tab and cleans it up on disconnect. */
export const subscribeNotification = (userId: string, response: Response) => {
  response.status(200);
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.setHeader('X-Accel-Buffering', 'no');
  response.flushHeaders();
  response.write(': connected\n\n');

  const userSubscribers = subscribers.get(userId) ?? new Set<Response>();
  userSubscribers.add(response);
  subscribers.set(userId, userSubscribers);

  const heartbeat = setInterval(() => {
    try {
      response.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25_000);

  const cleanup = () => {
    clearInterval(heartbeat);
    userSubscribers.delete(response);
    if (!userSubscribers.size) subscribers.delete(userId);
  };

  response.on('close', cleanup);
};

/** Best-effort live delivery; the persisted notification remains the source of truth. */
export const publishNotification = (userId: string, notification: RealtimeNotification) => {
  const userSubscribers = subscribers.get(userId);
  if (!userSubscribers?.size) return;

  const payload = serialise(notification);
  for (const response of userSubscribers) {
    try {
      response.write(`event: notification\ndata: ${payload}\n\n`);
    } catch {
      response.end();
      userSubscribers.delete(response);
    }
  }
  if (!userSubscribers.size) subscribers.delete(userId);
};
