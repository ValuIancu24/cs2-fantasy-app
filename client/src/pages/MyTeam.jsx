import React, { useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';
import '../styles/myteam.css';

function TeamTag({ name, imageUrl }) {
  return (
    <span className="myteam-series-team">
      {imageUrl && <img src={imageUrl} alt={name || ''} className="myteam-series-team-logo" />}
      <span>{name || '?'}</span>
    </span>
  );
}

function formatDate(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleString('en-GB', {
    timeZone: 'Europe/Bucharest',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function MyTeam() {
  const { tournamentId } = useParams();
  const { apiBase, user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const token = localStorage.getItem('cs2_fantasy_token');

  const [leagues, setLeagues] = useState([]);
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentBanner, setTournamentBanner] = useState('');
  const [selectedLeagueId, setSelectedLeagueId] = useState('');
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/leagues`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (!Array.isArray(data)) return;
        const filtered = data.filter(l => String(l.tournament_id) === String(tournamentId));
        setLeagues(filtered);
        if (filtered.length > 0) {
          const paramLeague = searchParams.get('league');
          const match = paramLeague && filtered.find(l => String(l.id) === paramLeague);
          setSelectedLeagueId(match ? paramLeague : String(filtered[0].id));
        }
      })
      .catch(() => {});
  }, [apiBase, token, tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    fetch(`${apiBase}/tournaments/${tournamentId}/info`)
      .then(r => r.ok ? r.json() : null)
      .then(t => { if (t?.name) setTournamentName(t.name); if (t?.banner_url) setTournamentBanner(t.banner_url); })
      .catch(() => {});
    fetch(`${apiBase}/tournaments/${tournamentId}/lock-time`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setIsLocked(d.locked); })
      .catch(() => {});
  }, [apiBase, tournamentId]);

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

  const selectedLeague = leagues.find(l => String(l.id) === selectedLeagueId);
  const isFinished = selectedLeague?.tournament_status === 'historical';
  const effectiveLocked = isLocked && !isAdmin;

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
        <div className="myteam-header-top">
          <button className="btn-text" type="button" onClick={() => navigate(`/tournament/${tournamentId}/leagues`)}>
            ← Back to Leagues
          </button>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {tournamentBanner && <img src={tournamentBanner} alt="" style={{ height: 40, width: 'auto', objectFit: 'contain', borderRadius: '4px' }} />}
            {tournamentName ? `${tournamentName} — My Team` : 'My Team'}
          </h1>
        </div>
        {leagues.length > 0 && (
          <div className="myteam-header-controls">
            <SearchableSelect
              options={leagues.map(l => ({ value: l.id, label: l.name }))}
              value={selectedLeagueId}
              onChange={val => { setSelectedLeagueId(String(val)); setSearchParams({ league: String(val) }); }}
              placeholder="Select league..."
            />
            {selectedLeagueId && (
              <button className="btn-outlined small" type="button" onClick={() => navigate(`/tournament/${tournamentId}/leaderboard?league=${selectedLeagueId}`, { state: { from: 'my-team' } })}>
                View Leaderboard
              </button>
            )}
          </div>
        )}
      </div>

      {leagues.length === 0 && (
        <div className="panel myteam-empty">
          <p className="muted">You are not in any leagues for this tournament.</p>
          <button className="btn-primary" onClick={() => navigate(`/tournament/${tournamentId}/leagues`)}>
            Browse Leagues
          </button>
        </div>
      )}

      {loading && <p className="muted" style={{ padding: '1rem' }}>Loading team...</p>}

      {error && (
        <div className="panel">
          <p className="muted">{error}</p>
          {!isFinished && !effectiveLocked && (
            <button className="btn-outlined small" onClick={() => navigate(`/team-builder/${selectedLeagueId}`)}>
              Build Team
            </button>
          )}
          {!isFinished && effectiveLocked && (
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              You didn't set up a team before the tournament started.
            </p>
          )}
        </div>
      )}

      {breakdown && (
        <>
          <div className="myteam-summary panel">
            <div className="myteam-summary-info">
              <h2>{breakdown.team_name}</h2>
            </div>
            <div className="myteam-total-points">
              <span className="points-value">{breakdown.total_points}</span>
              <span className="muted" style={{ fontSize: '0.75rem' }}>Total Fantasy Points</span>
            </div>
          </div>

          {breakdown.lineup.length === 0 && (isFinished || effectiveLocked) && (
            <div className="panel" style={{ marginTop: '1rem' }}>
              <p className="muted">You didn't build a team before the tournament started.</p>
            </div>
          )}

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
                {player.player_image_url && (
                  <img src={player.player_image_url} alt={player.nickname} className="myteam-player-photo" />
                )}
                <span className="myteam-player-name">
                  {player.nickname}
                  {player.is_captain && <span className="myteam-captain-badge">C</span>}
                </span>
                {player.team_image_url
                  ? <img src={player.team_image_url} alt={player.team_name || ''} className="myteam-player-team-logo" />
                  : <span className="muted myteam-player-team">{player.team_name || '—'}</span>}
                <span className="myteam-player-pts">{player.total_points} Total Points</span>
                <span className="myteam-series-count muted">
                  {player.series.filter(s => !s.upcoming && !s.ongoing).length} {player.series.filter(s => !s.upcoming && !s.ongoing).length === 1 ? 'series' : 'series'}
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
                  <strong>
                    {player.nickname}
                    {player.is_captain && <span className="myteam-captain-badge">C</span>}
                  </strong>
                  {player.team_image_url
                    ? <img src={player.team_image_url} alt={player.team_name || ''} className="myteam-breakdown-team-logo" />
                    : <span className="muted" style={{ fontSize: '0.8rem' }}>{player.team_name}</span>}
                </div>
                {player.series.length === 0 && (
                  <p className="muted" style={{ padding: '0.5rem 0', fontSize: '0.85rem' }}>
                    No upcoming series.
                  </p>
                )}
                {player.series.map((s, i) => {
                  const hasTeams = s.team1_name || s.team2_name;
                  return (
                    <div key={s.series_id} className={`myteam-series-row ${s.ongoing ? 'ongoing' : s.upcoming ? 'upcoming' : ''}`}>
                      <div className="myteam-series-info">
                        <div className="myteam-series-matchup">
                          {hasTeams ? (
                            <>
                              <TeamTag name={s.team1_name} imageUrl={s.team1_image_url} />
                              <span className="myteam-series-vs">vs</span>
                              <TeamTag name={s.team2_name} imageUrl={s.team2_image_url} />
                            </>
                          ) : `Series #${i + 1}`}
                        </div>
                        <span className="muted myteam-series-meta">
                          {s.format || ''}
                          {s.scheduled_at ? ` · ${formatDate(s.scheduled_at)}` : ''}
                        </span>
                      </div>
                      {s.ongoing ? (
                        <span className="myteam-ongoing-badge">Ongoing</span>
                      ) : s.upcoming ? (
                        <span className="myteam-upcoming-badge">Upcoming</span>
                      ) : (
                        <div className="myteam-series-stats">
                          <span className="stat-kda">
                            <span className="stat-k">{s.kills}K</span>
                            {' / '}
                            <span className="stat-d">{s.deaths}D</span>
                            {' / '}
                            <span className="stat-a">{s.assists}A</span>
                          </span>
                          <span className="myteam-series-pts" style={{ color: '#a78bfa' }}>
                            {s.series_points >= 0 ? '+' : ''}{s.series_points} Performance Points
                          </span>
                          <span className={`myteam-series-pts ${s.team_points >= 0 ? 'positive' : 'negative'}`} title="Team Points">
                            {s.team_points >= 0 ? '+' : ''}{s.team_points} Team Points
                          </span>
                          <span className="myteam-series-pts" style={{ color: '#a78bfa', fontWeight: 700 }}>
                            = {(s.series_points + s.team_points)} Points
                            {player.is_captain && (
                              <span style={{ color: '#fbbf24' }}>
                                {' '}×2 = {(s.series_points + s.team_points) * 2} Points
                              </span>
                            )}
                          </span>
                        </div>
                      )}
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
                      {player.series.filter(s => !s.upcoming && !s.ongoing).map((s, i) => {
                        const fp = s.series_points + s.team_points;
                        const displayFp = player.is_captain ? fp * 2 : fp;
                        return (
                          <span key={s.series_id}>
                            {i > 0 && <span style={{ color: '#888' }}> + </span>}
                            <span style={{ color: player.is_captain ? '#fbbf24' : '#a78bfa', fontWeight: 600 }}>{displayFp} Points</span>
                          </span>
                        );
                      })}
                      &nbsp;=&nbsp;<strong style={{ color: '#a78bfa' }}>{player.total_points} Total Fantasy Points</strong>
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
                    <div key={`${s.player.id}-${s.series_id}`} className={`myteam-timeline-card ${s.ongoing ? 'ongoing' : s.upcoming ? 'upcoming' : ''}`}>
                      <div className="myteam-timeline-player">
                        {s.player.nickname}
                        {s.player.is_captain && <span className="myteam-captain-badge">C</span>}
                        {s.player.team_image_url && (
                          <img src={s.player.team_image_url} alt={s.player.team_name || ''} className="myteam-timeline-team-logo" />
                        )}
                      </div>
                      <div className="myteam-timeline-matchup">{matchup}</div>
                      <div className="myteam-timeline-meta muted">
                        {s.format || ''}
                        {s.scheduled_at ? ` · ${formatDate(s.scheduled_at)}` : ''}
                      </div>
                      {s.ongoing ? (
                        <span className="myteam-ongoing-badge">Ongoing</span>
                      ) : s.upcoming ? (
                        <span className="myteam-upcoming-badge">Upcoming</span>
                      ) : (
                        <>
                          <div className="myteam-timeline-kda">
                            <span className="stat-k">{s.kills}K</span>
                            {' / '}
                            <span className="stat-d">{s.deaths}D</span>
                            {' / '}
                            <span className="stat-a">{s.assists}A</span>
                          </div>
                          <div className="myteam-timeline-pts" style={{ color: '#a78bfa' }}>
                            {s.series_points >= 0 ? '+' : ''}{s.series_points} Performance Points
                          </div>
                          <div className={`myteam-timeline-pts ${s.team_points >= 0 ? 'positive' : 'negative'}`}>
                            {s.team_points >= 0 ? '+' : ''}{s.team_points} Team Points
                          </div>
                          <div className="myteam-timeline-pts" style={{ color: '#a78bfa', fontWeight: 700 }}>
                            = {(s.series_points + s.team_points)} Points
                            {s.player.is_captain && (
                              <span style={{ color: '#fbbf24' }}>
                                {' '}×2 = {(s.series_points + s.team_points) * 2} Points
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!isFinished && !effectiveLocked && (
            <div style={{ marginTop: '1rem' }}>
              <button
                className="btn-outlined small"
                onClick={() => navigate(`/team-builder/${selectedLeagueId}`)}
              >
                Edit Team
              </button>
            </div>
          )}
          {!isFinished && effectiveLocked && (
            <p className="muted" style={{ fontSize: '0.85rem', marginTop: '1rem' }}>
              The tournament has started. Your team can no longer be edited.
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default MyTeam;
