import assert from 'node:assert/strict';
import test from 'node:test';
import aiRouter from './ai.routes';
import superadminRouter from './superadmin.routes';

type RouterLayer = {
  name?: string;
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ name?: string }>;
  };
};

const layersOf = (router: unknown): RouterLayer[] => (
  (router as { stack?: RouterLayer[] }).stack || []
);

test('protects every AI endpoint with authentication and internal AI access middleware', () => {
  const layers = layersOf(aiRouter);
  assert.deepEqual(layers.slice(0, 2).map((layer) => layer.name), ['requireAuth', 'requireAiAccess']);

  const endpoints = layers
    .filter((layer) => layer.route)
    .map((layer) => `${Object.keys(layer.route?.methods || {}).sort().join(',')}:${layer.route?.path}`);

  assert.deepEqual(endpoints, [
    'get:/status',
    'get:/tools',
    'get:/briefing',
    'get:/history',
    'post:/history',
    'get:/history/:conversationId/messages',
    'patch:/history/:conversationId',
    'post:/chat',
    'get:/actions/catalog',
    'get:/actions/proposals',
    'post:/actions/proposals',
    'post:/actions/proposals/:id/review',
    'post:/actions/proposals/:id/execute',
  ]);
});

test('keeps AI provider settings behind the dedicated AI settings permission handler', () => {
  const aiSettingsRoutes = layersOf(superadminRouter)
    .filter((layer) => layer.route && String(layer.route.path).startsWith('/ai-settings'))
    .map((layer) => ({
      path: layer.route?.path,
      methods: Object.keys(layer.route?.methods || {}).sort(),
      handlers: layer.route?.stack.map((handler) => handler.name),
    }));

  assert.deepEqual(aiSettingsRoutes, [
    { path: '/ai-settings', methods: ['get'], handlers: ['requireAiSettingsManagement', 'getAiSettingsController'] },
    { path: '/ai-settings', methods: ['put'], handlers: ['requireAiSettingsManagement', 'updateAiSettingsController'] },
    { path: '/ai-settings/test', methods: ['post'], handlers: ['requireAiSettingsManagement', 'testAiSettingsConnectionController'] },
    { path: '/ai-settings/key', methods: ['delete'], handlers: ['requireAiSettingsManagement', 'removeAiSettingsKeyController'] },
  ]);
});
