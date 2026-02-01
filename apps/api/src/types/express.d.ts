declare global {
  namespace Express {
    interface Request {
      agent?: {
        id: string;
        name: string;
        type: string;
      };
    }
  }
}

export {};
