/**
 * FallbackDecisionProvider — Rule-based fallback for agents without external AI.
 *
 * Sprint 3 humanization (S3.7):
 *   - Critical needs (any < 20) → variance=0, always fix the problem
 *   - Unemployed + crisis band → 5% idle chance
 *   - Normal conditions → 15% chance to relax/idle instead of work
 *   - Parcel/build goals checked weekly only (not every tick)
 *
 * Priority order (when not idling):
 * 1. hunger < 20 && balance >= 5 -> eat
 * 2. rest < 20 -> sleep
 * 3. fun < 20 && balance >= 3 -> relax
 * 4. unemployed && nearby vacancy -> apply (random vacancy)
 * 5. employed -> work
 * 6. none -> null (safe no-op)
 */

import type { DecisionProvider, DecisionRequest, ActionSuggestion } from './types';
import {
  FALLBACK_IDLE_CHANCE_NORMAL,
  FALLBACK_IDLE_CHANCE_CRISIS,
  WEEK_TICKS,
} from '@agentropolis/shared';

export class FallbackDecisionProvider implements DecisionProvider {
  readonly name = 'fallback';

  async requestDecision(req: DecisionRequest): Promise<ActionSuggestion | null> {
    const { agentId, tick, snapshot } = req;
    const { agent, nearbyBuildings, city } = snapshot;

    // Check if any need is critical
    const hasCriticalNeed = agent.needs.hunger < 20 || agent.needs.rest < 20 || agent.needs.fun < 20;

    // 1. Critical hunger — eat (no variance)
    if (agent.needs.hunger < 20 && agent.balance >= 5) {
      const foodBuilding = nearbyBuildings.find(
        (b) => (b.type === 'coffee_shop' || b.type === 'supermarket') && b.status === 'active',
      );
      return {
        agentId,
        action: {
          agentId,
          type: 'eat',
          targetBuildingId: foodBuilding?.id,
        },
        source: 'fallback',
      };
    }

    // 2. Critical rest — sleep (no variance)
    if (agent.needs.rest < 20) {
      return {
        agentId,
        action: {
          agentId,
          type: 'sleep',
          targetBuildingId: agent.homeId,
        },
        source: 'fallback',
      };
    }

    // 3. Critical fun — relax (no variance)
    if (agent.needs.fun < 20 && agent.balance >= 3) {
      const funBuilding = nearbyBuildings.find(
        (b) => (b.type === 'bar' || b.type === 'park') && b.status === 'active',
      );
      return {
        agentId,
        action: {
          agentId,
          type: 'relax',
          targetBuildingId: funBuilding?.id,
        },
        source: 'fallback',
      };
    }

    // S3.7: Humanization variance — only when no critical needs
    if (!hasCriticalNeed) {
      const isCrisis = city.treasury < 500; // crude check aligning with TREASURY_BAND_LOW
      const isUnemployed = !agent.employedAt;
      const idleChance = (isUnemployed && isCrisis)
        ? FALLBACK_IDLE_CHANCE_CRISIS
        : FALLBACK_IDLE_CHANCE_NORMAL;

      if (Math.random() < idleChance) {
        // "Human" behavior: take a break, go for a walk, relax
        // If balance allows, relax at a fun spot; otherwise just idle (no-op)
        if (agent.balance >= 3) {
          const funBuilding = nearbyBuildings.find(
            (b) => (b.type === 'bar' || b.type === 'park') && b.status === 'active',
          );
          return {
            agentId,
            action: {
              agentId,
              type: 'relax',
              targetBuildingId: funBuilding?.id,
            },
            source: 'fallback',
          };
        }
        // No money to relax → just idle (return null = no-op)
        return null;
      }
    }

    // 4. Unemployed — apply to a vacancy (S3.7: weekly goal check)
    if (!agent.employedAt) {
      // Only try to apply on weekly boundaries to avoid "spam applying"
      const isWeeklyCheck = tick % WEEK_TICKS === 0 || tick <= WEEK_TICKS;
      if (isWeeklyCheck) {
        const vacancies = nearbyBuildings.filter((b) => b.hasVacancy && b.status === 'active');
        if (vacancies.length > 0) {
          const target = vacancies[Math.floor(Math.random() * vacancies.length)];
          return {
            agentId,
            action: {
              agentId,
              type: 'apply',
              targetBuildingId: target.id,
            },
            source: 'fallback',
          };
        }
      }
      // Not a weekly check or no vacancies → idle
      return null;
    }

    // 5. Employed — work
    if (agent.employedAt) {
      return {
        agentId,
        action: {
          agentId,
          type: 'work',
        },
        source: 'fallback',
      };
    }

    // 6. No suitable action — safe no-op
    return null;
  }
}
