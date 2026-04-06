import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../App.jsx';
import '../styles/myteam.css';

function formatDate(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleDateString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    day: '2-digit',
    month: 'short'
  });
}

function MyTeam() {
  const { apiBase } = useContext(AuthContext);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = localStorage.getItem('cs2_fantasy_token');

  const [leagues, setLeagues] = useState([]);
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedPlayer, setExpandedPlayer] = useState(null);

  useEffect(() => {
    fetch(`${apiBase}/leagues`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setLeagues(data);
          const paramLeague = searchParams.get('league');
          const match = paramLeague && data.find(l => String(l.id) === paramLeague);
          setSelectedLeagueId(match ? paramLeague : String(data[0].id));
        }
      })
      .catch(() => {});
  }, [apiBase, token]);

  useEffect(() => {
    if (!selectedLeagueId) return;
    setBreakdown(null);
    setError('');
    setExpandedPlayer(null);
    setLoading(true);

    fetch(`${apiBase}/fantasy-teams/${selectedLeagueId}/breakdown`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => {
        if (!r.ok) throw new Error('no_team');
        return r.json();
      })
      .then(data => setBreakdown(data))
      .catch(e => setError(e.message === 'no_team'
        ? 'No fantasy team found for this league.'
        : 'Failed to load team data.'))
      .finally(() => setLoading(false));
  }, [selectedLeagueId, apiBase, token]);

  const togglePlayer = id => setExpandedPlayer(prev => (prev === id ? null : id));

  // All (player, serie) pairs sorted by scheduled_at descending
  const allSeriesEntries = useMemo(() => {
    if (!breakdown) return [];
    const entries = [];
    breakdown.lineup.forEach(player => {
      player.series.forEach(s => {
        entries.push({ ...s, player });
      });
    });
    entries.sort((a, b) => {
      if (!a.scheduled_at && !b.scheduled_at) return 0;
      if (!a.scheduled_at) return 1;
      if (!b.scheduled_at) return -1;
      return new Date(b.scheduled_at) - new Date(a.scheduled_at);
    });
    return entries;
  }, [breakdown]);

  return (
    <div className="myteam-page">
      <div className="myteam-header">
        <h1>My Team</h1>
        {leagues.length > 1 && (
          <select
            value={selectedLeagueId}
            onChange={e => setSelectedLeagueId(e.target.value)}
            className="league-select"
          >
            {leagues.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}{l.tournament_name ? ` — ${l.tournament_name}` : ''}
              </option>
            ))}
          </select>
        )}
        {leagues.length === 1 && (
          <span className="muted">{leagues[0].name}{leagues[0].tournament_name ? ` — ${leagues[0].tournament_name}` : ''}</span>
        )}
      </div>

      {leagues.length === 0 && (
        <div className="panel">
          <p className="muted">You are not in any leagues yet.</p>
          <button className="btn-primary" onClick={() => navigate('/my-fantasy')}>Browse Tournaments</button>
        </div>
      )}

      {loading && <p className="muted" style={{ padding: '1rem' }}>Loading team...</p>}

      {error && (
        <div className="panel">
          <p className="muted">{error}</p>
          <button className="btn-outlined small" onClick={() => navigate(`/team-builder/${selectedLeagueId}`)}>
            Build Team
          </button>
        </div>
      )}

      {breakdown && (
        <>
          <div className="myteam-summary panel">
            <div className="myteam-summary-info">
              <h2>{breakdown.team_name}</h2>
            </div>
            <div className="myteam-total-points">
              <span className="points-value">{breakdown.total_points.toFixed(1)}</span>
              <span className="muted" style={{ fontSize: '0.75rem' }}>Total Points</span>
            </div>
          </div>

          <div className="myteam-players">
            {breakdown.lineup.map(player => (
              <div
                key={player.id}
                className={`myteam-player-card panel ${expandedPlayer === player.id ? 'active' : ''}`}
                onClick={() => togglePlayer(player.id)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && togglePlayer(player.id)}
              >
                <span className="myteam-player-name">{player.nickname}</span>
                <span className="muted myteam-player-team">{player.team_name || '—'}</span>
                <span className="myteam-player-pts">{player.total_points.toFixed(1)} pts</span>
                <span className="myteam-series-count muted">
                  {player.series.length} {player.series.length === 1 ? 'series' : 'series'}
                </span>
              </div>
            ))}
          </div>

          {expandedPlayer && (() => {
            const player = breakdown.lineup.find(p => p.id === expandedPlayer);
            if (!player) return null;
            return (
              <div className="myteam-breakdown panel">
                <div className="myteam-breakdown-header">
                  <strong>{player.nickname}</strong>
                  <span className="muted" style={{ fontSize: '0.8rem' }}>{player.team_name}</span>
                </div>
                {player.series.length === 0 && (
                  <p className="muted" style={{ padding: '0.5rem 0', fontSize: '0.85rem' }}>
                    No stats yet. Sync stats from Admin panel.
                  </p>
                )}
                {player.series.map((s, i) => {
                  const matchup = [s.team1_name, s.team2_name].filter(Boolean).join(' vs ') || `Series #${i + 1}`;
                  return (
                    <div key={s.series_id} className="myteam-series-row">
                      <div className="myteam-series-info">
                        <span className="myteam-series-matchup">{matchup}</span>
                        <span className="muted myteam-series-meta">
                          {s.format || ''}
                          {s.scheduled_at ? ` · ${formatDate(s.scheduled_at)}` : ''}
                        </span>
                      </div>
                      <div className="myteam-series-stats">
                        <span className="stat-kda">
                          <span className="stat-k">{s.kills}K</span>
                          {' / '}
                          <span className="stat-d">{s.deaths}D</span>
                          {' / '}
                          <span className="stat-a">{s.assists}A</span>
                        </span>
                        <span className={`myteam-series-pts ${s.series_points >= 0 ? 'positive' : 'negative'}`}>
                          {s.series_points >= 0 ? '+' : ''}{s.series_points.toFixed(1)} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
                {player.series.length > 0 && (
                  <div className="myteam-breakdown-total">
                    <span>Total</span>
                    <span>
                      {player.series.reduce((s, r) => s + r.kills, 0)}K /&nbsp;
                      {player.series.reduce((s, r) => s + r.deaths, 0)}D /&nbsp;
                      {player.series.reduce((s, r) => s + r.assists, 0)}A
                      &nbsp;·&nbsp;
                      <strong>{player.total_points.toFixed(1)} pts</strong>
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {allSeriesEntries.length > 0 && (
            <div className="myteam-timeline panel">
              <h3 className="myteam-timeline-title">Series Breakdown</h3>
              <div className="myteam-timeline-scroll">
                {allSeriesEntries.map((s, i) => {
                  const matchup = [s.team1_name, s.team2_name].filter(Boolean).join(' vs ') || `Series #${i + 1}`;
                  return (
                    <div key={`${s.player.id}-${s.series_id}`} className="myteam-timeline-card">
                      <div className="myteam-timeline-player">{s.player.nickname}</div>
                      <div className="myteam-timeline-matchup">{matchup}</div>
                      <div className="myteam-timeline-meta muted">
                        {s.format || ''}
                        {s.scheduled_at ? ` · ${formatDate(s.scheduled_at)}` : ''}
                      </div>
                      <div className="myteam-timeline-kda">
                        <span className="stat-k">{s.kills}K</span>
                        {' / '}
                        <span className="stat-d">{s.deaths}D</span>
                        {' / '}
                        <span className="stat-a">{s.assists}A</span>
                      </div>
                      <div className={`myteam-timeline-pts ${s.series_points >= 0 ? 'positive' : 'negative'}`}>
                        {s.series_points >= 0 ? '+' : ''}{s.series_points.toFixed(1)} pts
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: '1rem' }}>
            <button
              className="btn-outlined small"
              onClick={() => navigate(`/team-builder/${selectedLeagueId}`)}
            >
              Edit Team
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default MyTeam;
