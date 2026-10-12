import { shouldHideWebViewLoading, shouldShowWebViewLoading } from '../src/lib/webViewLoading';

test('hides the native loading bar when navigation has completed', () => {
  expect(shouldHideWebViewLoading({ loading: false, progress: 0.2 })).toBe(true);
  expect(shouldHideWebViewLoading({ loading: true, progress: 0.95 })).toBe(true);
  expect(shouldHideWebViewLoading({ loading: true, progress: 0.4 })).toBe(false);
});

test('does not restart the loading bar after a page is already visible', () => {
  expect(shouldShowWebViewLoading(false)).toBe(true);
  expect(shouldShowWebViewLoading(true)).toBe(false);
  expect(shouldShowWebViewLoading(true, true)).toBe(true);
});
