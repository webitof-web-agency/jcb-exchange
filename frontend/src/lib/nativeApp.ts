export const isReactNativeWebView = (value: object | null | undefined) =>
  Boolean(value && 'ReactNativeWebView' in value);
