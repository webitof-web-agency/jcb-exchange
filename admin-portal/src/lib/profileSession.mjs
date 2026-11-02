export const getProfileSessionToken = (responseToken, currentToken) =>
  typeof responseToken === 'string' && responseToken.trim() ? responseToken : currentToken;
