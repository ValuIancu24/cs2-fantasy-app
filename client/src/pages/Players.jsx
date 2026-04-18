import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import PlayerFlipCard from '../components/PlayerFlipCard.jsx';
import '../styles/players.css';

function Players() {
  const { tournamentId } = useParams();
  const { apiBase } = useContext(AuthContext);
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [tournamentName, setTournamentName] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase}/players?tournament_id=${tournamentId}`).then(r => r.ok ? r.json() : []),
      fetch(`${apiBase}/tournaments/${tournamentId}/info`).then(r => r.ok ? r.json() : null)
    ])
      .then(([playersData, tournamentData]) => {
        setPlayers(Array.isArray(playersData) ? playersData : []);
        if (tournamentData?.name) setTournamentName(tournamentData.name);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase, tournamentId]);

  const groupedByTeam = useMemo(() => {
    const map = new Map();
    players.forEach(p => {
      const team = p.team_name || 'Unknown';
      if (!map.has(team)) map.set(team, []);
      map.get(team).push(p);
    });
    return map;
  }, [players]);

  const toggleTeam = team => setExpanded(prev => ({ ...prev, [team]: !prev[team] }));

  if (loading) return <p className="muted" style={{ padding: '1rem' }}>Loading players...</p>;

  return (
    <div className="players-page">
      <div className="players-header">
        <button className="btn-text" type="button" onClick={() => navigate(`/tournament/${tournamentId}/leagues`)}>
          ← Back to Leagues
        </button>
        <h1>{tournamentName ? `${tournamentName} — Players` : 'Players'}</h1>
      </div>

      {players.length === 0 && (
        <p className="muted">No players found for this tournament.</p>
      )}

      <div className="players-teams">
        {[...groupedByTeam.entries()].map(([team, teamPlayers]) => (
          <div key={team} className="players-team-section">
            <button
              className="players-team-toggle"
              type="button"
              onClick={() => toggleTeam(team)}
            >
              <span>{team}</span>
              <span className="players-toggle-icon">{expanded[team] ? '▲' : '▼'}</span>
            </button>
            {expanded[team] && (
              <div className="players-cards-grid">
                {teamPlayers.map(p => (
                  <PlayerFlipCard key={p.id} player={p} tournamentId={tournamentId} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Players;
