import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SocketProvider } from './socket';
import { CityCommand } from './pages/CityCommand';

const MapTest = lazy(() => import('./pages/MapTest'));

export function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          {/* Map prototype test - no socket needed */}
          <Route path="/map-test" element={
            <Suspense fallback={<div style={{ background: '#000', color: '#fff', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>}>
              <MapTest />
            </Suspense>
          } />

          {/* Main game - single world, loading handled internally */}
          <Route path="/" element={<CityCommand />} />

          {/* Legacy redirects */}
          <Route path="/game" element={<Navigate to="/" replace />} />
          <Route path="/multiverse" element={<Navigate to="/" replace />} />
          <Route path="/world/:worldId" element={<Navigate to="/" replace />} />
          <Route path="/world/:worldId/map" element={<Navigate to="/" replace />} />
          <Route path="/hacks" element={<Navigate to="/" replace />} />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}
