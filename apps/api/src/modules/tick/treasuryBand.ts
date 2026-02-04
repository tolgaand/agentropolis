/**
 * TreasuryBandTracker — Smoothed treasury band with hysteresis.
 *
 * Instead of flipping bands tick-to-tick based on instantaneous balance,
 * uses a 20-tick moving average and hysteresis thresholds to prevent flip-flop.
 *
 * Hysteresis rules:
 *   crisis → normal:  MA must exceed TREASURY_HYSTERESIS_LOW_EXIT  (650)
 *   normal → crisis:  MA must drop below TREASURY_BAND_LOW          (500)
 *   normal → boom:    MA must exceed TREASURY_BAND_HIGH             (8000)
 *   boom   → normal:  MA must drop below TREASURY_HYSTERESIS_HIGH_EXIT (7500)
 */

import {
  TREASURY_MA_WINDOW,
  TREASURY_BAND_LOW,
  TREASURY_BAND_HIGH,
  TREASURY_HYSTERESIS_LOW_EXIT,
  TREASURY_HYSTERESIS_HIGH_EXIT,
  DEMAND_BAND_CRISIS_MULT,
  DEMAND_BAND_NORMAL_MULT,
  DEMAND_BAND_BOOM_MULT,
} from '@agentropolis/shared';

export type TreasuryBand = 'crisis' | 'normal' | 'boom';

export class TreasuryBandTracker {
  private history: number[] = [];
  private currentBand: TreasuryBand = 'normal';

  /** Record a treasury balance sample and return the smoothed band */
  update(balance: number): TreasuryBand {
    this.history.push(balance);
    if (this.history.length > TREASURY_MA_WINDOW) {
      this.history.shift();
    }

    const ma = this.getMovingAverage();
    this.currentBand = this.computeBand(ma);
    return this.currentBand;
  }

  /** Get current band without updating */
  getBand(): TreasuryBand {
    return this.currentBand;
  }

  /** Get moving average (or last value if not enough history) */
  getMovingAverage(): number {
    if (this.history.length === 0) return 0;
    const sum = this.history.reduce((a, b) => a + b, 0);
    return sum / this.history.length;
  }

  /** Get the demand band multiplier for current band */
  getDemandMultiplier(): number {
    switch (this.currentBand) {
      case 'crisis': return DEMAND_BAND_CRISIS_MULT;
      case 'boom': return DEMAND_BAND_BOOM_MULT;
      default: return DEMAND_BAND_NORMAL_MULT;
    }
  }

  private computeBand(ma: number): TreasuryBand {
    switch (this.currentBand) {
      case 'crisis':
        // Must exceed hysteresis exit threshold to leave crisis
        if (ma >= TREASURY_HYSTERESIS_LOW_EXIT) return 'normal';
        return 'crisis';

      case 'boom':
        // Must drop below hysteresis exit threshold to leave boom
        if (ma <= TREASURY_HYSTERESIS_HIGH_EXIT) return 'normal';
        return 'boom';

      case 'normal':
      default:
        if (ma < TREASURY_BAND_LOW) return 'crisis';
        if (ma > TREASURY_BAND_HIGH) return 'boom';
        return 'normal';
    }
  }
}
