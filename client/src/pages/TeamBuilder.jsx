import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../App.jsx';
import '../styles/teambuilder.css';

function TeamBuilder() {
  const { leagueId } = useParams();
  const { apiBase } = useContext(AuthContext);
  const navigate = useNavigate();
  const [players, setPlayers] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [selected, setSelected] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const token = localStorage.getItem('cs2_fantasy_token');

  useEffect(() => {
    const load = async () => {
      // Fetch players for this league's tournament
      const res = await fetch(`${apiBase}/players?league_id=${leagueId}`);
      if (res.ok) {
        const data = await res.json();
        setPlayers(data);
      }

      // Load existing team if any
      const teamRes = await fetch(`${apiBase}/fantasy-teams/${leagueId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (teamRes.ok) {
        const t = await teamRes.json();
        setTeamName(t.team_name);
        setSelected(JSON.parse(t.lineup || '[]').map(String));
      }
    };
    load();
  }, [leagueId, apiBase, token]);

  const teamCounts = useMemo(() => {
    const counts = {};
    selected.forEach(id => {
      const p = players.find(pl => String(pl.id) === id);
      if (p && p.team_name) {
        counts[p.team_name] = (counts[p.team_name] || 0) + 1;
      }
    });
    return counts;
  }, [selected, players]);

  const canSelect = player => {
    const id = String(player.id);
    if (selected.includes(id)) return true;
    if (selected.length >= 5) return false;
    const count = teamCounts[player.team_name] || 0;
    if (count >= 2) return false;
    return true;
  };

  const togglePlayer = player => {
    const id = String(player.id);
    if (selected.includes(id)) {
      setSelected(selected.filter(s => s !== id));
    } else {
      if (!canSelect(player)) return;
      setSelected([...selected, id]);
    }
  };

  const groupedPlayers = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? players.filter(p => p.nickname.toLowerCase().includes(q) || (p.team_name || '').toLowerCase().includes(q))
      : players;

    const map = new Map();
    filtered.forEach(p => {
      const team = p.team_name || 'Unknown';
      if (!map.has(team)) map.set(team, []);
      map.get(team).push(p);
    });
    return map;
  }, [players, filter]);

  const saveTeam = async () => {
    setError('');
    setSuccess('');

    if (selected.length !== 5) {
      setError('You must select exactly 5 players');
      return;
    }
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    const existingRes = await fetch(`${apiBase}/fantasy-teams/${leagueId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    let res;
    if (existingRes.ok) {
      const existing = await existingRes.json();
      res = await fetch(`${apiBase}/fantasy-teams/${existing.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ teamName: teamName.trim(), lineup: selected })
      });
    } else {
      res = await fetch(`${apiBase}/fantasy-teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ leagueId: Number(leagueId), teamName: teamName.trim(), lineup: selected })
      });
    }

    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Failed to save team');
    } else {
      navigate(`/my-team?league=${leagueId}`, { replace: true });
    }
  };

  const selectedPlayers = selected.map(id => players.find(p => String(p.id) === id)).filter(Boolean);

  return (
    <div className="teambuilder">
      <div className="panel">
        <div className="tb-header-row">
          <h2>Build Your Team</h2>
          <button className="btn-text small" onClick={() => navigate(-1)}>← Back</button>
        </div>

        <label>
          Team Name
          <input
            type="text"
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder="My Super Team"
          />
        </label>

        <p className="muted">Pick exactly 5 players · Max 2 per real team</p>

        {selected.length > 0 && (
          <div className="tb-selected-list">
            {selectedPlayers.map(p => (
              <div key={p.id} className="tb-selected-chip">
                <span>{p.nickname}</span>
                <span className="muted" style={{ fontSize: '0.75rem' }}>{p.team_name}</span>
                <button className="btn-text small" onClick={() => togglePlayer(p)}>✕</button>
              </div>
            ))}
          </div>
        )}

        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Selected: <strong>{selected.length} / 5</strong>
        </p>

        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}
        <button className="btn-primary" onClick={saveTeam} disabled={selected.length !== 5 || !teamName.trim()}>
          Save Team
        </button>
      </div>

      <div className="panel">
        <h2>Players</h2>
        {players.length === 0 && (
          <p className="muted">No players found. Make sure the tournament has been synced.</p>
        )}
        {players.length > 0 && (
          <input
            type="text"
            placeholder="Search by name or team..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ marginBottom: '0.75rem' }}
          />
        )}
        <div className="player-groups">
          {[...groupedPlayers.entries()].map(([teamName, teamPlayers]) => (
            <div key={teamName} className="player-team-group">
              <div className="player-team-label">{teamName}</div>
              <div className="player-row">
                {teamPlayers.map(p => {
                  const id = String(p.id);
                  const isSelected = selected.includes(id);
                  const disabled = !canSelect(p) && !isSelected;
                  return (
                    <button
                      key={p.id}
                      className={`player-card ${isSelected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
                      type="button"
                      onClick={() => togglePlayer(p)}
                      disabled={disabled}
                    >
                      <div className="player-info">
                        <div className="name-row">
                          <span>{p.nickname}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default TeamBuilder;
