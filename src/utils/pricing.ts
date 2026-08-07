export const calculatePricePerSqm = (rent: number = 0, size: number = 0): number => {
  if (!rent || !size || size <= 0) return 0;
  return Math.floor((rent / size) * 10) / 10;
};
