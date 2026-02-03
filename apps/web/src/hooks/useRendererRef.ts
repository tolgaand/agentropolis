/**
 * RendererContext - React context for CityRendererV2 instance access.
 *
 * IMPORTANT: The renderer lives in a ref (not state) so it won't trigger
 * re-renders when assigned. Use useRendererRef() in interval/callback code
 * to read ref.current at call-time rather than closing over a stale null.
 */
import { createContext, useContext, type RefObject } from 'react';
import type { CityRendererV2 } from '../lib/map/three/CityRendererV2';

const RendererContext = createContext<RefObject<CityRendererV2 | null> | null>(null);

export const RendererProvider = RendererContext.Provider;

/**
 * Get the raw ref object. Use this inside setInterval/callbacks
 * where you need fresh .current reads each tick.
 */
export function useRendererRef(): RefObject<CityRendererV2 | null> | null {
  return useContext(RendererContext);
}
