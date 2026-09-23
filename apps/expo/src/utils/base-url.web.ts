export const getBaseUrl = () => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  if (!url) {
    throw new Error("EXPO_PUBLIC_API_URL is not set");
  }
  return url;
};
