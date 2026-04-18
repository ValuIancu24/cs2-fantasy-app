import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import '../styles/players.css';

function formatPrice(price) {
  return `${Math.round((price ?? 190000) / 1000)}K`;
}

function PlayerProfile() {
  const { tournamentId, playerId } = useParams();
  const { apiBase } = useContext(AuthContext);
  const navigate = useNavigate();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/players/${playerId}?tournament_id=${tournamentId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setPlayer(data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase, playerId, tournamentId]);

  return (
    <div className="player-profile-page">
      <button className="btn-text" type="button" onClick={() => navigate(-1)}>← Back</button>

      {loading && <p className="muted" style={{ marginTop: '1rem' }}>Loading...</p>}

      {!loading && !player && (
        <p className="muted" style={{ marginTop: '1rem' }}>Player not found.</p>
      )}

      {player && (
        <div className="player-profile-header panel">
          <h1 className="player-profile-name">{player.nickname}</h1>
          <span className="muted player-profile-team">{player.team_name || '—'}</span>
          <span className="player-price player-profile-price">{formatPrice(player.price)}</span>
        </div>
      )}
    </div>
  );
}

export default PlayerProfile;
