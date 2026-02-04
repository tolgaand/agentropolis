/**
 * City Routes — Public city state + metrics + events
 */

import { Router } from 'express';
import { CityModel, AgentModel, BuildingModel, EventModel } from '@agentropolis/db';
import { CITY_ID } from '@agentropolis/shared';
import { getLastMetrics } from '../modules/tick';
import { getTreasuryBandTracker } from '../modules/tick/tickPipeline';
import { decisionTelemetry, actionRecorder } from '../modules/decision';
import { eventStore } from '../modules/realtime/eventStore';
import { seasonGoalTracker } from '../modules/realtime/seasonGoalTracker';
import { policyState, getActivePolicy } from '../modules/realtime/policyState';
import { highlightTracker } from '../modules/realtime/highlightTracker';
import { careerArcTracker } from '../modules/realtime/careerArcTracker';
import { seasonReportTracker } from '../modules/realtime/seasonReportTracker';

const router: ReturnType<typeof Router> = Router();

// ---- GET /api/city — City overview ----
router.get('/', async (_req, res) => {
  const city = await CityModel.findOne({ cityId: CITY_ID }).lean();
  if (!city) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'City not found' } });
    return;
  }

  const [agentCount, buildingCount] = await Promise.all([
    AgentModel.countDocuments({ cityId: CITY_ID }),
    BuildingModel.countDocuments({ cityId: CITY_ID }),
  ]);

  res.json({
    cityId: city.cityId,
    name: city.name,
    tickCount: city.tickCount,
    season: city.season,
    economy: city.economy,
    buildingCount,
    agentCount,
  });
});

// ---- GET /api/city/metrics — Live city metrics (from last tick) ----
router.get('/metrics', (_req, res) => {
  const metrics = getLastMetrics();
  if (!metrics) {
    res.status(503).json({ success: false, error: { code: 'NOT_FOUND', message: 'No metrics yet — wait for first tick' } });
    return;
  }
  res.json(metrics);
});

// ---- GET /api/city/events — Recent game events ----
router.get('/events', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const sinceTickParam = req.query.sinceTick;
  const typeParam = req.query.type;

  const filter: Record<string, unknown> = { cityId: CITY_ID };
  if (sinceTickParam !== undefined) {
    filter.tick = { $gte: Number(sinceTickParam) };
  }
  if (typeParam) {
    filter.type = typeParam;
  }

  const events = await EventModel.find(filter)
    .sort({ tick: -1, createdAt: -1 })
    .limit(limit)
    .lean();

  res.json({
    events: events.map((e) => ({
      id: e._id.toString(),
      type: e.type,
      description: e.description,
      severity: e.severity,
      resolved: e.resolved,
      tick: e.tick,
      createdAt: (e as unknown as { createdAt?: string }).createdAt,
    })),
    count: events.length,
  });
});

// ---- GET /api/city/economy — Economy dashboard (S2.1 flow metrics) ----
router.get('/economy', (_req, res) => {
  const metrics = getLastMetrics();
  if (!metrics) {
    res.status(503).json({ ok: false, reason: 'no_metrics_yet' });
    return;
  }

  res.json({
    tick: metrics.tick,
    treasury: metrics.treasury,
    moneySupply: metrics.moneySupply,
    demandBudgetBalance: metrics.demandBudgetBalance,
    treasuryBand: metrics.treasuryBand,
    flow: metrics.flow,
    rates: {
      unemploymentRate: metrics.unemploymentRate,
      crimeRateLast10: metrics.crimeRateLast10,
    },
    businesses: {
      open: metrics.openBusinesses,
      closed: metrics.closedBusinesses,
    },
    outsideWorldCRD: metrics.outsideWorldCRD,
    season: metrics.season,
  });
});

// ---- GET /api/city/decisions — Decision engine telemetry ----
router.get('/decisions', (_req, res) => {
  res.json({
    aggregates: decisionTelemetry.getAggregates(),
    recent: decisionTelemetry.getRecent(20),
  });
});

// ---- GET /api/city/decisions/replay — Action replay by tick ----
router.get('/decisions/replay', (req, res) => {
  const tickParam = req.query.tick;
  if (tickParam !== undefined) {
    const tick = Number(tickParam);
    const record = actionRecorder.getByTick(tick);
    if (!record) {
      res.status(404).json({ ok: false, reason: 'tick_not_found' });
      return;
    }
    res.json(record);
    return;
  }
  // No tick specified — return recent
  res.json({ recent: actionRecorder.getRecent(10) });
});

// ---- GET /api/city/feed — Reconnect replay endpoint (S4.7) ----
router.get('/feed', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const sinceTickParam = req.query.sinceTick;
  const channelParam = req.query.channel as string | undefined;

  const channel = (channelParam === 'story' || channelParam === 'telemetry')
    ? channelParam
    : undefined;

  if (sinceTickParam !== undefined) {
    const sinceTick = Number(sinceTickParam);
    const events = eventStore.sinceTick(sinceTick, limit, channel);
    res.json({ events, count: events.length, sinceTick });
    return;
  }

  // No sinceTick — return recent events
  const events = channel === 'story'
    ? eventStore.recentStory(limit)
    : eventStore.recent(limit);

  res.json({ events, count: events.length });
});

// ---- GET /api/city/pacing — Pacing system state (S3) ----
router.get('/pacing', (_req, res) => {
  const tracker = getTreasuryBandTracker();
  const metrics = getLastMetrics();

  res.json({
    treasuryBand: {
      current: tracker.getBand(),
      movingAverage: Math.round(tracker.getMovingAverage()),
      demandMultiplier: tracker.getDemandMultiplier(),
    },
    recentFeedEvents: eventStore.recent(20).map((e) => ({
      id: e.id,
      type: e.type,
      headline: e.headline,
      severity: e.severity,
      tick: e.tick,
    })),
    tick: metrics?.tick ?? 0,
    season: metrics?.season ?? 'unknown',
  });
});

// ---- GET /api/city/goals — Current season goals (S5.1) ----
router.get('/goals', (_req, res) => {
  const goals = seasonGoalTracker.getCurrentGoals();
  if (!goals) {
    res.json({ goals: null, reason: 'no_season_started' });
    return;
  }
  res.json(goals);
});

// ---- GET /api/city/vote — Current policy vote state (S5.5) ----
router.get('/vote', (_req, res) => {
  const vote = policyState.getCurrentVote();
  res.json({
    vote,
    activePolicy: getActivePolicy(),
  });
});

// ---- POST /api/city/vote — Cast a vote (S5.5) ----
// S5.6: IP-based anti-spam — one vote per IP per week
const voteIpTracker = new Map<string, number>(); // IP → weekNumber
router.post('/vote', (req, res) => {
  const { optionId, socketId } = req.body as { optionId?: string; socketId?: string };

  if (!optionId || !socketId) {
    res.status(400).json({ ok: false, reason: 'missing_optionId_or_socketId' });
    return;
  }

  // IP rate limit
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const currentVote = policyState.getCurrentVote();
  if (currentVote) {
    const lastWeek = voteIpTracker.get(ip);
    if (lastWeek === currentVote.weekNumber) {
      res.status(429).json({ ok: false, reason: 'ip_already_voted_this_week' });
      return;
    }
    voteIpTracker.set(ip, currentVote.weekNumber);
  }

  // Clean old entries periodically
  if (voteIpTracker.size > 10_000) {
    voteIpTracker.clear();
  }

  const result = policyState.castVote(socketId, optionId);
  res.json(result);
});

// ---- GET /api/city/highlights — Latest highlight reel (S5.4) ----
router.get('/highlights', (_req, res) => {
  const seasonReel = highlightTracker.getLastSeasonReel();
  res.json({ seasonReel });
});

// ---- GET /api/city/characters — Agent character cards (S5.3) ----
router.get('/characters', (_req, res) => {
  res.json({ characters: careerArcTracker.getAllCards() });
});

// ---- GET /api/city/report — Last season report (S5.7) ----
router.get('/report', (_req, res) => {
  const report = seasonReportTracker.getLastReport();
  if (!report) {
    res.json({ report: null, reason: 'no_season_completed' });
    return;
  }
  res.json(report);
});

export default router;
