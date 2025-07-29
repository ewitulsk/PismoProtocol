/**
 * Utility functions for formatting addresses
 */

/**
 * Abbreviates an address to show the first 4 characters, ellipses, and last 4 characters
 * @param address - The full address string
 * @returns Abbreviated address in format "0x12...abcd"
 */
export const abbreviateAddress = (
  address: string,
  opts?: { withPrefix?: boolean }
): string => {
  if (!address) return '';
  let clean = address.startsWith('0x') ? address.slice(2) : address;
  if (clean.length <= 8) return opts?.withPrefix ? `0x${clean}` : clean;
  const abbreviated = `${clean.slice(0, 4)}...${clean.slice(-4)}`;
  return opts?.withPrefix !== false ? `0x${abbreviated}` : abbreviated;
};
