/**
 * RequireConnection - Route guard component
 *
 * Redirects to loading screen if socket is not synced.
 * Prevents direct navigation to protected routes.
 */

import { Navigate } from 'react-router-dom';
import { useConnectionStatus } from '../socket';

interface RequireConnectionProps {
  children: React.ReactNode;
}

export function RequireConnection({ children }: RequireConnectionProps) {
  const connectionStatus = useConnectionStatus();

  // Only allow access when synced
  if (connectionStatus !== 'synced') {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
