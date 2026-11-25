import cron, { type ScheduledTask } from 'node-cron';
import { REMINDER_TIMEZONE, createReminderRunner } from '../modules/hrm/joiningReminderRules';
import { runJoiningReminders } from '../modules/hrm/services/joiningReminder.service';

/**
 * HRM joining reminder: one day before a joining, after 09:00 India time, HR and the State Manager are reminded of a
 * joining checklist that is still incomplete. The timer only wakes the runner every 5 minutes; the runner acts once per
 * Indian day (a failed run is tried again on the next wake-ups) and a start-up catch-up covers a server that was down
 * at 09:00. Unique dedupe keys on every notification and message make a restart or a second server harmless.
 * Switch off with HRM_JOINING_REMINDER=off.
 */

export const hrmJoiningReminderDisabled = (env: NodeJS.ProcessEnv = process.env) =>
  ['false', '0', 'off', 'no'].includes((env.HRM_JOINING_REMINDER || '').trim().toLowerCase());

const runner = createReminderRunner(runJoiningReminders);
let task: ScheduledTask | null = null;

const wake = (label: string) => {
  void runner.wake()
    .then((outcome) => {
      if (outcome.ran && (outcome.result.failed || outcome.result.joiners)) {
        console.log(`[hrm-joining-reminder] ${label}: ${JSON.stringify(outcome.result)}`);
      }
    })
    .catch((error) => console.error(`[hrm-joining-reminder] ${label} failed:`, error instanceof Error ? error.message : error));
};

export const startHrmJoiningReminderJob = () => {
  if (task || hrmJoiningReminderDisabled()) return;
  task = cron.schedule('*/5 * * * *', () => wake('tick'), { timezone: REMINDER_TIMEZONE });
  setTimeout(() => wake('startup catch-up'), 45_000).unref();
};
