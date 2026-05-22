import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';

import Dashboard from './pages/Dashboard.jsx';
import EVProfile from './pages/EVProfile.jsx';
import Performance from './pages/Performance.jsx';
import Battery from './pages/Battery.jsx';
import Range from './pages/Range.jsx';
import Charging from './pages/Charging.jsx';
import Degradation from './pages/Degradation.jsx';
import Cost from './pages/Cost.jsx';
import Health from './pages/Health.jsx';
import AIAdvisor from './pages/AIAdvisor.jsx';
import DigitalTwin from './pages/DigitalTwin.jsx';
import Reports from './pages/Reports.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/ev-profile" element={<EVProfile />} />
        <Route path="/performance" element={<Performance />} />
        <Route path="/battery" element={<Battery />} />
        <Route path="/range" element={<Range />} />
        <Route path="/charging" element={<Charging />} />
        <Route path="/degradation" element={<Degradation />} />
        <Route path="/cost" element={<Cost />} />
        <Route path="/health" element={<Health />} />
        <Route path="/ai-advisor" element={<AIAdvisor />} />
        <Route path="/digital-twin" element={<DigitalTwin />} />
        <Route path="/reports" element={<Reports />} />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

