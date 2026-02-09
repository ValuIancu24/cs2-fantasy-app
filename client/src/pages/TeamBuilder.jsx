import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AuthContext } from '../App.jsx';
import '../styles/teambuilder.css';

const BUDGET = 1000000;

function TeamBuilder() {
  const { leagueId } = useParams();
  const { apiBase } = useContext(AuthContext);
  const [players, setPlayers] = useState([]);
  const [teamName, setTeamName] = useState('');
  const [selected, setSelected] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const token = localStorage.getItem('cs2_fantasy_token');

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`${apiBase}/players`);
      const data = await res.json();
      setPlayers(data);

      // Try load existing team
      const teamRes = await fetch(`${apiBase}/fantasy-teams/${leagueId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (teamRes.ok) {
        const t = await teamRes.json();
        setTeamName(t.team_name);
        setSelected(JSON.parse(t.lineup || '[]'));
      }
    };
    load();
  }, [leagueId, apiBase, token]);

  const budgetSpent = useMemo(() => {
    return selected.reduce((sum, id) => {
      const p = players.find(pl => pl.id === String(id));
      return sum + (p ? p.price : 0);
    }, 0);
  }, [selected, players]);

  const remaining = BUDGET - budgetSpent;

  const teamCounts = useMemo(() => {
    const counts = {};
    selected.forEach(id => {
      const p = players.find(pl => pl.id === String(id));
      if (p) {
        counts[p.real_team] = (counts[p.real_team] || 0) + 1;
      }
    });
    return counts;
  }, [selected, players]);

  const canSelect = player => {
    const alreadySelected = selected.includes(player.id);
    if (alreadySelected) return true;
    if (selected.length >= 5) return false;
    const newBudget = budgetSpent + player.price;
    if (newBudget > BUDGET) return false;
    const count = teamCounts[player.real_team] || 0;
    if (count >= 2) return false;
    return true;
  };

  const togglePlayer = player => {
    if (selected.includes(player.id)) {
      setSelected(selected.filter(id => id !== player.id));
    } else {
      if (!canSelect(player)) return;
      setSelected([...selected, player.id]);
    }
  };

  const validate = () => {
    if (selected.length !== 5) {
      return 'You must select exactly 5 players';
    }
    if (budgetSpent > BUDGET) {
      return 'Budget exceeded';
    }
    for (const teamName in teamCounts) {
      if (teamCounts[teamName] > 2) {
        return 'Maximum 2 players from the same team';
      }
    }
    return null;
  };

  const saveTeam = async () => {
    setError('');
    setSuccess('');
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    const body = {
      leagueId: Number(leagueId),
      teamName,
      lineup: selected
    };
    const existingRes = await fetch(`${apiBase}/fantasy-teams/${leagueId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    let res;
    if (existingRes.ok) {
      const existing = await existingRes.json();
      res = await fetch(`${apiBase}/fantasy-teams/${existing.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ teamName, lineup: selected })
      });
    } else {
      res = await fetch(`${apiBase}/fantasy-teams`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });
    }
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Failed to save team');
    } else {
      setSuccess('Team saved successfully');
    }
  };

  return (
    <div className="teambuilder">
      <div className="panel">
        <h2>Build Your Team</h2>
        <label>
          Team Name
          <input
            type="text"
            value={teamName}
            onChange={e => setTeamName(e.target.value)}
            placeholder="My Super Team"
            required
          />
        </label>
        <div className="budget-row">
          <span>Budget: 1,000,000</span>
          <span>Spent: {budgetSpent.toLocaleString()}</span>
          <span className={remaining < 0 ? 'bad' : ''}>
            Remaining: {remaining.toLocaleString()}
          </span>
        </div>
        <p className="muted">Pick exactly 5 players. Max 2 per real team.</p>
        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}
        <button className="btn-primary" onClick={saveTeam} disabled={!teamName}>
          Save Team
        </button>
      </div>

      <div className="panel">
        <h2>Players</h2>
        <div className="player-grid">
          {players.map(p => {
            const selectedCls = selected.includes(p.id) ? 'selected' : '';
            const disabled = !canSelect(p) && !selected.includes(p.id);
            return (
              <button
                key={p.id}
                className={`player-card ${selectedCls} ${disabled ? 'disabled' : ''}`}
                type="button"
                onClick={() => togglePlayer(p)}
                disabled={disabled && !selected.includes(p.id)}
              >
                <div className="player-image">
                  {/* Placeholder for /public/images/players/{p.image} */}
                </div>
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
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default TeamBuilder;

