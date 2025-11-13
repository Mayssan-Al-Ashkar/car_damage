import './App.css';
import UploadSingle from './components/UploadSingle';
import UploadCompare from './components/UploadCompare';
import { useState } from 'react';

export default function App() {
  const [tab, setTab] = useState<'single' | 'compare'>('single');

  return (
    <div className="container">
      <h1 className="title">🚗 Vehicle Condition Assessment</h1>
      <p className="subtitle">Upload vehicle photos to detect damages and get exact USD repair estimates. Compare pick‑up vs return to see new damage.</p>
      <div className="tabs">
        <button className={`tab-btn ${tab==='single' ? 'active' : ''}`} onClick={() => setTab('single')}>Single Image</button>
        <button className={`tab-btn ${tab==='compare' ? 'active' : ''}`} onClick={() => setTab('compare')}>Before / After Compare</button>
      </div>
      <div className="panel">
        {tab === 'single' ? <UploadSingle /> : <UploadCompare />}
      </div>
    </div>
  );
}
