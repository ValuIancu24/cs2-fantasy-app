import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App.jsx';
import '../styles/admin.css';

function AdminDashboard() {
  const { apiBase } = useContext(AuthContext);
  const [stageId, setStageId] = useState('quarter_finals');
  const [matchId, setMatchId] = useState('');
  const [scenarioId, setScenarioId] = useState(1);
  const [stats, setStats] = useState(null);
  const [message, setMessage] = useState('');

  const token = localStorage.getItem('cs2_fantasy_token');

  const fetchStats = async () => {
    const res = await fetch(`${apiBase}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setStats(data);
      setScenarioId(data.active_scenario || 1);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const callAdmin = async (path, body) => {
    setMessage('');
    const res = await fetch(`${apiBase}/admin/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message || 'Action failed');
    } else {
      setMessage(data.message || 'Action completed');
      fetchStats();
    }
  };

  const handleSimulateMatch = () => {
    if (!matchId) {
      setMessage('Enter match ID (e.g. qf1, sf2, gf)');
      return;
    }
    callAdmin('simulate-match', { matchId, stageId });
  };

  const handleSimulateStage = () => {
    callAdmin('simulate-stage', { stageId });
  };

  const handleReset = type => {
    const body = { type };
    if (type === 'match') body.matchId = matchId;
    if (type === 'stage') body.stageId = stageId;
    callAdmin('reset-match', body);
  };

  const changeScenario = async () => {
    setMessage('');
    const res = await fetch(`${apiBase}/admin/scenario`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ scenarioId })
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message || 'Failed to update scenario');
    } else {
      setMessage(data.message || 'Scenario updated');
      fetchStats();
    }
  };

  return (
    <div className="admin-grid">
      <section className="panel">
        <h2>Match Simulation</h2>
        <label>
          Active Scenario
          <div className="scenario-row">
            <select
              value={scenarioId}
              onChange={e => setScenarioId(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map(id => (
                <option key={id} value={id}>
                  Scenario {id}
                </option>
              ))}
            </select>
            <button type="button" className="btn-outlined small" onClick={changeScenario}>
              Set
            </button>
          </div>
        </label>
        <label>
          Stage
          <select value={stageId} onChange={e => setStageId(e.target.value)}>
            <option value="quarter_finals">Quarter Finals</option>
            <option value="semi_finals">Semi Finals</option>
            <option value="grand_final">Grand Final</option>
          </select>
        </label>
        <label>
          Match ID
          <input
            type="text"
            placeholder="qf1 / sf2 / gf"
            value={matchId}
            onChange={e => setMatchId(e.target.value)}
          />
        </label>
        <div className="admin-buttons">
          <button type="button" className="btn-primary small" onClick={handleSimulateMatch}>
            Simulate Match
          </button>
          <button type="button" className="btn-outlined small" onClick={handleSimulateStage}>
            Simulate Stage
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Reset Options</h2>
        <div className="admin-buttons">
          <button type="button" className="btn-outlined small" onClick={() => handleReset('match')}>
            Reset Last Match ID
          </button>
          <button type="button" className="btn-outlined small" onClick={() => handleReset('stage')}>
            Reset Current Stage
          </button>
          <button type="button" className="btn-outlined small" onClick={() => handleReset('all')}>
            Reset All Matches
          </button>
        </div>
        {message && <p className="info-text">{message}</p>}
      </section>

      <section className="panel">
        <h2>Statistics</h2>
        {stats ? (
          <ul className="stats-list">
            <li>
              <strong>Total Users:</strong> {stats.total_users}
            </li>
            <li>
              <strong>Total Leagues:</strong> {stats.total_leagues}
            </li>
            <li>
              <strong>Total Fantasy Teams:</strong> {stats.total_fantasy_teams}
            </li>
            <li>
              <strong>Total Matches Simulated:</strong> {stats.total_matches_simulated}
            </li>
            <li>
              <strong>Last Simulation:</strong>{' '}
              {stats.last_simulation_timestamp || 'Never'}
            </li>
          </ul>
        ) : (
          <p className="muted">Loading stats...</p>
        )}
      </section>
    </div>
  );
}

export default AdminDashboard;

