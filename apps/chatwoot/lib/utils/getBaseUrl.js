export const getBaseUrl = () => {
  if (
    typeof window !== 'undefined' &&
    window.chatwootConfig &&
    window.chatwootConfig.apiURL
  ) {
    return window.chatwootConfig.apiURL;
  }
  if (typeof process !== 'undefined' && process.env && process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  return 'http://localhost:3333';
};
