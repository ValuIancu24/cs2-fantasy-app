import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App.jsx';
import '../styles/myteam.css';

function MyTeam() {
  const { apiBase } = useContext(AuthContext);
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');

  const token = localStorage.getItem('cs2_fantasy_token');

  useEffect(() => {
    const load = async () => {
      setError('');
      try {
        // For simplicity we fetch the first league team the user has
        const leaguesRes = await fetch(`${apiBase}/leagues`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const leagues = await leaguesRes.json();
        if (!Array.isArray(leagues) || leagues.length === 0) {
          setError('You are not in any leagues yet.');
          return;
        }
        const leagueId = leagues[0].id;
        const res = await fetch(`${apiBase}/fantasy-teams/${leagueId}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          setError('No fantasy team found. Create one from the league dashboard.');
          return;
        }
        const data = await res.json();
        setTeam(data);
      } catch (e) {
        setError('Failed to load team');
      }
    };
    load();
  }, [apiBase, token]);

  if (error) {
    return <div className="panel"><p className="error-text">{error}</p></div>;
  }

  if (!team) {
    return <div className="panel"><p className="muted">Loading team...</p></div>;
  }

  return (
    <div className="panel myteam">
      <h2>{team.team_name}</h2>
      <p className="muted">
        Budget spent: {team.budget_spent.toLocaleString()} • Total points: {team.total_points} (Rating: {team.rating_points}, Team: {team.team_points})
      </p>

      <div className="myteam-grid">
        {team.players && team.players.map(p => (
          <div key={p.id} className="myteam-card">
            <div className="player-image">{/* Placeholder for player image */}</div>
            <div className="player-info">
              <div className="name-row">
                <span>{p.name}</span>
                <span className="role">{p.role}</span>
              </div>
              <div className="meta-row">
                <span className="team">{p.real_team}</span>
                <span className="price">{p.price.toLocaleString()}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="match-section">
        <h3>Upcoming Matches</h3>
        <p className="muted">
          Upcoming match data is not wired to a live schedule in this demo. You can extend this
          section to show fixtures per player.
        </p>
      </div>

      <div className="match-section">
        <h3>Match History</h3>
        <p className="muted">
          Match performance is reflected via your total points after simulations. Add a UI here to
          display per-match breakdowns if you extend the backend.
        </p>
      </div>
    </div>
  );
}

export default MyTeam;

