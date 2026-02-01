/**
 * useNotificationQueue - Socket events -> notification objects with auto-expiry
 *
 * Listens to hacking, trade, and bounty events from socket context
 * and produces a queue of notification objects that auto-expire.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSocketContext } from '../socket';

export type NotificationType = 'hack' | 'trade' | 'bounty' | 'agent' | 'breach';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  detail?: string;
  timestamp: number;
  /** agentId to fly camera to */
  targetAgentId?: string;
  /** worldId for color coding */
  worldId?: string;
}

const MAX_VISIBLE = 8;
const EXPIRY_MS = 15_000;

let notifCounter = 0;

export function useNotificationQueue() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const { activeBattles, recentBattles, recentTrades, activeSieges } = useSocketContext();

  // Track previously seen IDs to only notify on new items
  const seenBattleIds = useRef(new Set<string>());
  const seenResolvedIds = useRef(new Set<string>());
  const seenTradeIds = useRef(new Set<string>());
  const seenSiegeIds = useRef(new Set<string>());
  const initializedRef = useRef(false);

  const addNotification = useCallback((notif: Omit<Notification, 'id' | 'timestamp'>) => {
    const id = `notif-${++notifCounter}`;
    setNotifications(prev => {
      const next = [{ ...notif, id, timestamp: Date.now() }, ...prev];
      return next.slice(0, MAX_VISIBLE * 2); // Keep buffer
    });
  }, []);

  // Initialize seen sets on first data (don't notify for initial sync)
  useEffect(() => {
    if (initializedRef.current) return;
    if (activeBattles.length || recentBattles.length || recentTrades.length || activeSieges.length) {
      for (const b of activeBattles) seenBattleIds.current.add(b.battleId);
      for (const r of recentBattles) seenResolvedIds.current.add(r.battleId);
      for (const t of recentTrades) seenTradeIds.current.add(t.tradeId || `${t.sellerId}-${t.buyerId}`);
      for (const s of activeSieges) seenSiegeIds.current.add(s.siegeId);
      initializedRef.current = true;
    }
  }, [activeBattles, recentBattles, recentTrades, activeSieges]);

  // Watch for new Battles
  useEffect(() => {
    if (!initializedRef.current) return;
    for (const battle of activeBattles) {
      if (!seenBattleIds.current.has(battle.battleId)) {
        seenBattleIds.current.add(battle.battleId);
        addNotification({
          type: 'hack',
          message: `BATTLE: ${battle.attackerName || 'Unknown'} \u2694 ${battle.defenderName || 'Unknown'}`,
          detail: `[${battle.status}]`,
          targetAgentId: battle.defenderId,
          worldId: battle.defenderWorldId,
        });
      }
    }
  }, [activeBattles, addNotification]);

  // Watch for resolved battles
  useEffect(() => {
    if (!initializedRef.current) return;
    for (const resolved of recentBattles) {
      if (!seenResolvedIds.current.has(resolved.battleId)) {
        seenResolvedIds.current.add(resolved.battleId);
        addNotification({
          type: 'breach',
          message: resolved.victor === 'attacker'
            ? `VICTORY: ${resolved.attackerName || 'Unknown'} defeated ${resolved.defenderName || 'Unknown'}`
            : `DEFENDED: ${resolved.defenderName || 'Unknown'} repelled ${resolved.attackerName || 'Unknown'}`,
          targetAgentId: resolved.defenderId,
          worldId: resolved.defenderWorldId,
        });
      }
    }
  }, [recentBattles, addNotification]);

  // Watch for new trades
  useEffect(() => {
    if (!initializedRef.current) return;
    for (const trade of recentTrades) {
      const tradeKey = trade.tradeId || `${trade.sellerId}-${trade.buyerId}`;
      if (!seenTradeIds.current.has(tradeKey)) {
        seenTradeIds.current.add(tradeKey);
        addNotification({
          type: 'trade',
          message: `TRADE: ${trade.quantity || '?'} ${trade.resourceId || '?'} @ ${(trade.totalPrice || 0).toFixed(1)}`,
          worldId: trade.sellerWorldId,
        });
      }
    }
  }, [recentTrades, addNotification]);

  // Watch for new sieges
  useEffect(() => {
    if (!initializedRef.current) return;
    for (const siege of activeSieges) {
      if (!seenSiegeIds.current.has(siege.siegeId)) {
        seenSiegeIds.current.add(siege.siegeId);
        addNotification({
          type: 'bounty',
          message: `SIEGE: ${siege.attackerWorldId} attacking ${siege.defenderWorldId} (${siege.progress}%)`,
          worldId: siege.defenderWorldId,
        });
      }
    }
  }, [activeSieges, addNotification]);

  // Auto-expire notifications
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setNotifications(prev => prev.filter(n => now - n.timestamp < EXPIRY_MS));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const visible = notifications.slice(0, MAX_VISIBLE);

  return { notifications: visible, addNotification };
}
