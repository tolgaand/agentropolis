/**
 * Agent Routes — REST API for AI agent interaction
 *
 * POST /api/agents/register  — Create new agent (public)
 * POST /api/agents/action    — Queue an action (auth required)
 * GET  /api/agents/me         — Get own snapshot (auth required)
 * GET  /api/agents            — List all agents (public)
 * GET  /api/agents/:agentId   — Get public agent snapshot
 */

import { Router } from 'express';
import { AgentModel } from '@agentropolis/db';
import { CITY_ID } from '@agentropolis/shared';
import { agentAuth } from '../middleware/agentAuth';
import { handleRegister, buildAgentSnapshot, actionQueue } from '../modules/agent';
import { getIO } from '../modules/realtime';
import { SOCKET_EVENTS } from '@agentropolis/shared/contracts/v2';
import type {
  AgentJoinedPayload,
  AgentActionPayload,
} from '@agentropolis/shared/contracts/v2';

const router: ReturnType<typeof Router> = Router();

// ---- POST /api/agents/register (public) ----
router.post('/register', async (req, res) => {
  const { name, aiModel, career } = req.body;

  if (!name || typeof name !== 'string') {
    res.status(400).json({ ok: false, reason: 'missing_name' });
    return;
  }

  const { response, sideEffects } = await handleRegister(
    { name, aiModel: aiModel || 'unknown', career },
    CITY_ID,
  );

  // Broadcast side effects via socket
  const io = getIO();
  if (io) {
    for (const effect of sideEffects) {
      if (effect.type === 'agent_joined') {
        io.emit(SOCKET_EVENTS.AGENT_JOINED as 'agent:joined', effect.data as unknown as AgentJoinedPayload);
      }
    }
  }

  if (!response.ok) {
    res.status(409).json(response);
    return;
  }

  res.status(201).json(response);
});

// ---- POST /api/agents/action (auth required) ----
router.post('/action', agentAuth, async (req, res) => {
  const agent = req.agent!;

  if (agent.status === 'jailed') {
    res.status(403).json({ ok: false, reason: 'agent_jailed' });
    return;
  }

  const payload: AgentActionPayload = {
    agentId: agent._id.toString(), // Injected from auth — agent can't impersonate
    type: req.body.type,
    requestId: req.body.requestId,
    targetBuildingId: req.body.targetBuildingId,
    targetAgentId: req.body.targetAgentId,
    worldX: req.body.worldX,
    worldZ: req.body.worldZ,
    buildingType: req.body.buildingType,
    assetKey: req.body.assetKey,
    rotY: req.body.rotY,
  };

  if (!payload.type) {
    res.status(400).json({ ok: false, reason: 'missing_action_type' });
    return;
  }

  const enqueueResult = actionQueue.enqueue('rest-api', payload);
  if (!enqueueResult.ok) {
    res.status(429).json({ ok: false, reason: enqueueResult.reason, requestId: enqueueResult.requestId });
    return;
  }

  res.json({ ok: true, queued: true, requestId: enqueueResult.requestId });
});

// ---- GET /api/agents/me (auth required) ----
router.get('/me', agentAuth, async (req, res) => {
  const agent = req.agent!;
  const snapshot = await buildAgentSnapshot(agent);
  res.json(snapshot);
});

// ---- GET /api/agents (public) — List all agents ----
router.get('/', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  const filter: Record<string, unknown> = { cityId: CITY_ID };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.profession) filter.profession = req.query.profession;

  const agents = await AgentModel.find(filter)
    .sort({ reputation: -1 })
    .skip(offset)
    .limit(limit);

  const snapshots = await Promise.all(agents.map((a) => buildAgentSnapshot(a)));
  const total = await AgentModel.countDocuments(filter);

  res.json({ agents: snapshots, total, limit, offset });
});

// ---- GET /api/agents/:agentId (public) ----
router.get('/:agentId', async (req, res) => {
  const agent = await AgentModel.findById(req.params.agentId);
  if (!agent || agent.cityId !== CITY_ID) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
    return;
  }

  const snapshot = await buildAgentSnapshot(agent);
  res.json(snapshot);
});

export default router;
