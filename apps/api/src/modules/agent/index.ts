export { handleRegister, handleAction } from './actionEngine';
export type { ActionResult, ActionSideEffects } from './actionEngine';
export { authenticateSocket, validateAgentOwnership } from './socketAuth';
export type { SocketAuthData } from './socketAuth';
export { buildAgentSnapshot } from './agentSnapshot';
export { actionQueue } from './actionQueue';
export type { QueuedAction } from './actionQueue';
