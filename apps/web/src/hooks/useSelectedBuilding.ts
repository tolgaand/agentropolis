/**
 * useSelectedBuilding - Track clicked building state for IntelPanel
 */

import { useState, useCallback } from 'react';

export interface SelectedBuilding {
  buildingId: string;
  agentId: string | null;
  blockX: number;
  blockY: number;
}

export function useSelectedBuilding() {
  const [selected, setSelected] = useState<SelectedBuilding | null>(null);

  const selectBuilding = useCallback((building: SelectedBuilding) => {
    setSelected(building);
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(null);
  }, []);

  return { selected, selectBuilding, clearSelection };
}
