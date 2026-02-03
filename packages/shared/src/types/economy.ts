import type { Currency } from './city';

export type AccountOwnerType = 'agent' | 'city' | 'building' | 'district' | 'npc_pool';
export type AccountStatus = 'active' | 'frozen';

export type TransactionType =
  | 'salary' | 'purchase' | 'tax' | 'crime_income'
  | 'fine' | 'rent' | 'construction' | 'operating_cost' | 'npc_revenue'
  | 'subsidy' | 'import_fee' | 'mint';

export interface AccountData {
  id: string;
  ownerType: AccountOwnerType;
  ownerId: string;
  currency: Currency;
  balance: number;
  reserved: number;
  status: AccountStatus;
}

export interface LedgerEntryData {
  id: string;
  debitAccountId: string;
  creditAccountId: string;
  amount: number;
  currency: Currency;
  type: TransactionType;
  tick: number;
  meta?: {
    buildingId?: string;
    districtId?: string;
    reason?: string;
  };
}

export interface EconomySnapshot {
  moneySupply: number;
  priceIndex: number;
  inflationRate: number;
  gdpRolling: number;
  unemploymentRate: number;
  crimeRate: number;
  treasury: number;
  taxRate: number;
  averageIncome: number;
  totalBuildings: number;
  totalAgents: number;
}
