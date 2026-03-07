import React from 'react';
import SummaryCard from './components/SummaryCard';
import ViewerChart from './components/ViewerChart';
import OverlapCard from './components/OverlapCard';
import AverageDropCard from './components/AverageDropCard';
import DropEventsCard from './components/DropEventsCard';
import MigrationCard from './components/MigrationCard';
import TraitorCard from './components/TraitorCard';

function App() {
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

export default App;
