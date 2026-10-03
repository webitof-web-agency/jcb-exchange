import { shouldHideWebViewLoading } from '../src/lib/webViewLoading';

test('hides the native loading bar when navigation has completed', () => {
  expect(shouldHideWebViewLoading({ loading: false, progress: 0.2 })).toBe(true);
  expect(shouldHideWebViewLoading({ loading: true, progress: 0.95 })).toBe(true);
  expect(shouldHideWebViewLoading({ loading: true, progress: 0.4 })).toBe(false);
});
