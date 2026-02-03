/**
 * Shared enum-like union types used across socket contracts and domain types.
 */

export type PlacementSource = 'stub' | 'real';
export type CityMode = 'stub' | 'real' | 'hybrid';
export type ZoneType = 'residential' | 'commercial' | 'park' | 'civic';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type NewsSeverity = 'routine' | 'minor' | 'major';

/** Agent action types sent via agent:action */
export type AgentActionType = 'work' | 'eat' | 'sleep' | 'relax' | 'apply' | 'crime' | 'buy_parcel' | 'build' | 'upgrade';

/** Socket connection role */
export type SocketRole = 'spectator' | 'agent';
