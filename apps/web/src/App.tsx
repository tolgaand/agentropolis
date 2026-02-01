import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './socket';
import { RequireConnection } from './components/RequireConnection';
import { LoadingScreen } from './pages/LoadingScreen';
import { Multiverse } from './pages/Multiverse';
import { CityCommand } from './pages/CityCommand';
import { Hacks } from './pages/Hacks';

export function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          {/* Public route - Loading/Connection gate */}
          <Route path="/" element={<LoadingScreen />} />

          {/* Protected routes - require synced connection */}
          <Route
            path="/multiverse"
            element={
              <RequireConnection>
                <Multiverse />
              </RequireConnection>
            }
          />
          <Route
            path="/world/:worldId"
            element={
              <RequireConnection>
                <CityCommand />
              </RequireConnection>
            }
          />
          <Route
            path="/hacks"
            element={
              <RequireConnection>
                <Hacks />
              </RequireConnection>
            }
          />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}
