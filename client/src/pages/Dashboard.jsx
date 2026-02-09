import React, { useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AuthContext } from '../App.jsx';
import '../styles/dashboard.css';

function Dashboard() {
  const { apiBase } = useContext(AuthContext);
  const [leagues, setLeagues] = useState([]);
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinLeagueId, setJoinLeagueId] = useState('');
  const [message, setMessage] = useState('');

  const token = localStorage.getItem('cs2_fantasy_token');

  const fetchLeagues = async () => {
    const res = await fetch(`${apiBase}/leagues`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      setLeagues(data);
    }
  };

  useEffect(() => {
    fetchLeagues();
  }, []);

  const createLeague = async e => {
    e.preventDefault();
    setMessage('');
    const res = await fetch(`${apiBase}/leagues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ name, isPrivate, joinCode: isPrivate ? joinCode || undefined : null })
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message || 'Failed to create league');
    } else {
      setMessage('League created');
      setName('');
      setIsPrivate(false);
      setJoinCode('');
      fetchLeagues();
    }
  };

  const joinLeague = async e => {
    e.preventDefault();
    setMessage('');
    if (!joinLeagueId) return;
    const res = await fetch(`${apiBase}/leagues/${joinLeagueId}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ joinCode: joinCode || undefined })
    });
    const data = await res.json();
    if (!res.ok) {
      setMessage(data.message || 'Failed to join league');
    } else {
      setMessage('Joined league');
      setJoinLeagueId('');
      setJoinCode('');
      fetchLeagues();
    }
  };

  return (
    <div className="dashboard">
      <section className="panel">
        <h2>Your Leagues</h2>
        {leagues.length === 0 && <p className="muted">You are not in any leagues yet.</p>}
        <div className="league-list">
          {leagues.map(l => (
            <div key={l.id} className="league-card">
              <h3>{l.name}</h3>
              <p className="muted">
                {l.status} • Members: {l.member_count}
              </p>
              <div className="league-actions">
                <Link to={`/team-builder/${l.id}`} className="btn-primary small">
                  Build Team
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Create League</h2>
        <form onSubmit={createLeague} className="form-inline">
          <input
            type="text"
            placeholder="League name"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={e => setIsPrivate(e.target.checked)}
            />
            Private (join code)
          </label>
          {isPrivate && (
            <input
              type="text"
              placeholder="Optional custom join code"
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              maxLength={6}
            />
          )}
          <button type="submit" className="btn-primary small">
            Create
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Join League</h2>
        <form onSubmit={joinLeague} className="form-inline">
          <input
            type="number"
            placeholder="League ID"
            value={joinLeagueId}
            onChange={e => setJoinLeagueId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Join code (if required)"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
          <button type="submit" className="btn-outlined small">
            Join
          </button>
        </form>
        {message && <p className="info-text">{message}</p>}
      </section>
    </div>
  );
}

export default Dashboard;

