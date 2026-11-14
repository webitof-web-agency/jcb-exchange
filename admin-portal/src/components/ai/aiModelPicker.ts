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

export const hasProviderModel = (
  models: readonly Pick<AiModelOption, 'id'>[],
  modelId: string | null | undefined,
) => Boolean(modelId && models.some((model) => model.id === modelId));

export const getProviderModelCatalogMessage = (
  errorMessage: string | null | undefined,
  modelCount: number,
) => {
  if (errorMessage) return errorMessage;
  if (modelCount === 0) {
    return 'No compatible chat models were returned by the configured provider. Check this API key’s project model access, then refresh.';
  }
  return null;
};
