type WebViewLoadingState = {
  loading: boolean;
  progress: number;
};

export const shouldHideWebViewLoading = ({ loading, progress }: WebViewLoadingState) => (
  !loading || progress >= 0.9
);
