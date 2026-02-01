export type JobName =
  | 'seed:system-agent'
  | 'seed:worlds'
  | 'seed:resources'
  | 'time:advance'
  | 'daily:reset'
  | 'economy:market-prices'
  | 'economy:exchange-rates';

export interface JobPayloads {
  'seed:system-agent': Record<string, never>;
  'seed:worlds': Record<string, never>;
  'seed:resources': Record<string, never>;
  'time:advance': { minutes?: number };
  'daily:reset': Record<string, never>;
  'economy:market-prices': Record<string, never>;
  'economy:exchange-rates': Record<string, never>;
}
