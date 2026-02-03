/**
 * Agent Auth Middleware — Bearer token authentication for REST API
 *
 * Authorization: Bearer <apiKey>
 * Hashes with SHA-256, finds agent by apiKeyHash, attaches to req.agent
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { AgentModel, type IAgent } from '@agentropolis/db';

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      agent?: IAgent;
    }
  }
}

export async function agentAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Missing Bearer token' } });
    return;
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Empty API key' } });
    return;
  }

  const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
  const agent = await AgentModel.findOne({ apiKeyHash });

  if (!agent) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } });
    return;
  }

  req.agent = agent;
  next();
}
