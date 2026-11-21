import assert from 'node:assert/strict';
import test from 'node:test';
import documentRouter from './document.routes';

type RouterLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ name?: string }>;
  };
};

const routesOf = (router: unknown) => ((router as { stack?: RouterLayer[] }).stack || [])
  .filter((layer) => layer.route)
  .map((layer) => ({
    path: layer.route?.path,
    method: Object.keys(layer.route?.methods || {}).sort().join(','),
    handlers: layer.route?.stack.map((handler) => handler.name),
  }));

test('keeps secure document read and delete endpoints behind authentication and operator authorization', () => {
  const routes = routesOf(documentRouter);
  const secureRead = routes.find((route) => route.path === '/secure/:filename' && route.method === 'get');
  const secureDelete = routes.find((route) => route.path === '/secure/:filename' && route.method === 'delete');

  assert.deepEqual(secureRead?.handlers, ['requireAuth', 'requirePortalOperator', 'getSecureDocument']);
  assert.equal(secureDelete?.handlers?.[0], 'requireAuth');
  assert.equal(secureDelete?.handlers?.at(-1), 'deleteSecureDocument');
  assert.equal((secureDelete?.handlers?.length || 0) >= 3, true);
});
