export type AiModelOption = {
  id: string;
  name: string;
  capabilities: string[];
  transport: 'chat_completions' | 'responses';
};

export const filterAiModelOptions = (
  models: readonly AiModelOption[],
  query: string,
): AiModelOption[] => {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [...models];
  return models.filter((model) => `${model.id} ${model.name}`.toLowerCase().includes(normalizedQuery));
};
