import React from 'react';
import { Routes, Route } from 'react-router-dom';
import SummaryCard from './components/SummaryCard';
import ViewerChart from './components/ViewerChart';
import OverlapCard from './components/OverlapCard';
import AverageDropCard from './components/AverageDropCard';
import DropEventsCard from './components/DropEventsCard';
import MigrationCard from './components/MigrationCard';
import TraitorCard from './components/TraitorCard';
import PublicSearch from './pages/PublicSearch';
import TopTraitors from './pages/TopTraitors';

function Dashboard() {
  return (
    <div className="app">
      <header className="header">
        <h1>TikyJr vs Etostark</h1>
        <p>Analyse de correlation et detection des traitres</p>
      </header>

      <div className="dashboard">
        <SummaryCard />
        <TraitorCard />
        <ViewerChart />
        <OverlapCard />
        <AverageDropCard />
        <DropEventsCard />
        <MigrationCard />
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicSearch />} />
      <Route path="/top" element={<TopTraitors />} />
      <Route path="/dashboard" element={<Dashboard />} />
    </Routes>
  );
}

export default App;
