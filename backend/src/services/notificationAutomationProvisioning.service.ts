type AutomationRuleStore = {
  createMany: (args: {
    data: Array<{ eventCode: string; enabled: boolean }>;
    skipDuplicates: boolean;
  }) => Promise<unknown>;
};

/**
 * Persists an OFF rule for every supported event. A new rule never sends a
 * message by itself; an admin must still select an approved template/message
 * and explicitly turn the rule on.
 */
export const provisionAutomationRules = async (
  store: AutomationRuleStore,
  eventCodes: readonly string[],
) => {
  const uniqueEventCodes = [...new Set(eventCodes.map((eventCode) => eventCode.trim()).filter(Boolean))];
  if (!uniqueEventCodes.length) return;
  await store.createMany({
    data: uniqueEventCodes.map((eventCode) => ({ eventCode, enabled: false })),
    skipDuplicates: true,
  });
};
