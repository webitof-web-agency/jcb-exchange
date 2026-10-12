type WebViewLoadingState = {
  loading: boolean;
  progress: number;
};

export const WEBVIEW_LOADING_TIMEOUT_MS = 12_000;

export const shouldHideWebViewLoading = ({ loading, progress }: WebViewLoadingState) => (
  !loading || progress >= 0.9
);

export const shouldShowWebViewLoading = (hasVisiblePage: boolean, force = false) => (
  force || !hasVisiblePage
);
