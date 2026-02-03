/**
 * World module — Buildings, parcels, chunk payloads (RealLayer)
 *
 * No tick/economy/agent logic. Pure persistence + query.
 */

export * from './models';
export { worldToChunk } from './worldRepo';
export {
  getChunkPayload,
  placeBuilding,
  removeBuilding,
  type PlaceBuildingInput,
  type PlaceResult,
  type RemoveResult,
} from './worldService';
export { ensureCity, getCityState } from './cityService';
