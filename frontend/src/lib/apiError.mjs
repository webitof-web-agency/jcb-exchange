export const getApiErrorMessage = (error, fallback) => {
  if (error && typeof error === 'object') {
    const responseData = error.response?.data;
    const apiMessage = responseData?.error || responseData?.message;
    if (typeof apiMessage === 'string' && apiMessage.trim()) {
      return apiMessage.trim();
    }
  }

  return fallback;
};
