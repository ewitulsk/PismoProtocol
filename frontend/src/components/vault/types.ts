export interface Vault {
  id: string;
  name: string;
  symbol: string;
  totalValueLocked: number;
  userDeposit: number;
  apy: number;
}

export type TimeFilterType = "1D" | "1W" | "1M" | "1Y";

export interface TimeFilterProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}