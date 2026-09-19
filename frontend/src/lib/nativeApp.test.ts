import test from 'node:test';
import assert from 'node:assert/strict';
import { isReactNativeWebView } from './nativeApp';

test('identifies the React Native web view bridge without relying on any', () => {
  assert.equal(isReactNativeWebView({ ReactNativeWebView: {} }), true);
  assert.equal(isReactNativeWebView({}), false);
});
