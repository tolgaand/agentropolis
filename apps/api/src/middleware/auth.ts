import { Request, Response, NextFunction, RequestHandler } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { AgentModel } from '@agentropolis/db';
import { HttpError } from './errorHandler';
import { env } from '../config/env';

export interface AuthenticatedRequest extends Request {
  agent?: {
    id: string;
    name: string;
    type: string;
  };
}

// Hash API key for comparison
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Generate new API key
export function generateApiKey(): string {
  return `agtr_${crypto.randomBytes(32).toString('hex')}`;
}

// Generate JWT tokens
export function generateTokens(agentId: string): { accessToken: string; refreshToken: string } {
  const accessToken = jwt.sign(
    { agentId, type: 'access' },
    env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  const refreshToken = jwt.sign(
    { agentId, type: 'refresh' },
    env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  return { accessToken, refreshToken };
}

// Verify JWT token
function verifyToken(token: string): { agentId: string; type: string } | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as { agentId: string; type: string };
    return decoded;
  } catch {
    return null;
  }
}

// Auth middleware - supports both API key and JWT
export const authenticate: RequestHandler = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new HttpError(401, 'Authorization header required');
    }

    let agentId: string | null = null;

    // Check for Bearer token (JWT)
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const decoded = verifyToken(token);

      if (!decoded || decoded.type !== 'access') {
        throw new HttpError(401, 'Invalid or expired access token');
      }

      agentId = decoded.agentId;
    }
    // Check for API key
    else if (authHeader.startsWith('ApiKey ')) {
      const apiKey = authHeader.slice(7);
      const keyHash = hashApiKey(apiKey);

      const agent = await AgentModel.findOne({ apiKeyHash: keyHash }).select('+apiKeyHash');
      if (!agent) {
        throw new HttpError(401, 'Invalid API key');
      }

      agentId = agent._id.toString();
    } else {
      throw new HttpError(401, 'Invalid authorization format. Use "Bearer <token>" or "ApiKey <key>"');
    }

    // Fetch agent details
    const agent = await AgentModel.findById(agentId);
    if (!agent) {
      throw new HttpError(401, 'Agent not found');
    }

    req.agent = {
      id: agent._id.toString(),
      name: agent.name,
      type: agent.type,
    };

    next();
  } catch (error) {
    next(error);
  }
};

// Optional auth - continues even without auth
export const optionalAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  // If auth header exists, validate it
  await authenticate(req, res, next);
};
