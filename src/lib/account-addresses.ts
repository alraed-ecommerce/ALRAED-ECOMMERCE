export const normalizeDefaultAddresses = <T extends { is_default: boolean }>(addresses: T[]): T[] => {
  const defaultIndex = addresses.findIndex((address) => address.is_default);
  const selectedIndex = defaultIndex < 0 ? 0 : defaultIndex;

  return addresses.map((address, index) => ({
    ...address,
    is_default: index === selectedIndex,
  }));
};
