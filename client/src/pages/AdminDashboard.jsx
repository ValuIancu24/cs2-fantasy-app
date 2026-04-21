import React, { useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import '../styles/admin.css';

// SQLite CURRENT_TIMESTAMP has no 'Z', so we must force UTC parsing
const parseUTC = ts => new Date(ts.includes('T') ? ts : ts.replace(' ', 'T') + 'Z');

function formatScheduledTime(isoString) {
  if (!isoString) return 'TBD';
  return parseUTC(isoString).toLocaleString('en-GB', { timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short' });
}

function AdminDashboard() {
  const { apiBase } = useContext(AuthContext);
  const [stats, setStats] = useState(null);

  const [tournamentId, setTournamentId] = useState('');
  const [tournamentMatches, setTournamentMatches] = useState(null);
  const [tournamentFetching, setTournamentFetching] = useState(false);
  const [tournamentSyncing, setTournamentSyncing] = useState(false);
  const [statsSyncing, setStatsSyncing] = useState(false);
  const [pricesCalculating, setPricesCalculating] = useState(false);
  const [tournamentMessage, setTournamentMessage] = useState('');

  // Player management
  const [manageTournamentId, setManageTournamentId] = useState('');
  const [playerTeams, setPlayerTeams] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersMessage, setPlayersMessage] = useState('');
  const [expandedPlayer, setExpandedPlayer] = useState(null);
  const [playerAliases, setPlayerAliases] = useState({});
  const [newAlias, setNewAlias] = useState({});

  // Tournament banner
  const [activeTournaments, setActiveTournaments] = useState([]);
  const [bannerTournamentId, setBannerTournamentId] = useState('');
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState('');
  const [bannerMessage, setBannerMessage] = useState('');
  const [bannerSaving, setBannerSaving] = useState(false);

  // Manage tournaments
  const [allTournaments, setAllTournaments] = useState([]);
  const [tournamentStatusMsg, setTournamentStatusMsg] = useState('');

  // Price breakdown
  const [breakdownTournamentId, setBreakdownTournamentId] = useState('');
  const [breakdownData, setBreakdownData] = useState(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [breakdownMessage, setBreakdownMessage] = useState('');
  const [expandedBreakdown, setExpandedBreakdown] = useState(null);

  // Auto-sync
  const [syncLogs, setSyncLogs] = useState({});
  const [autoSyncToggles, setAutoSyncToggles] = useState({});

  const token = localStorage.getItem('cs2_fantasy_token');
  const objectUrlRef = useRef(null);

  useEffect(() => {
    return () => { if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current); };
  }, []);

  const fetchStats = async () => {
    const res = await fetch(`${apiBase}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setStats(await res.json());
  };

  const fetchAllTournaments = () => {
    fetch(`${apiBase}/admin/tournaments`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAllTournaments(data);
          const active = data.filter(t => t.status === 'active');
          setActiveTournaments(active);
          if (data.length > 0) {
            setBannerTournamentId(String(data[0].id));
            setBannerPreview(data[0].banner_url || '');
          }
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStats();
    fetchAllTournaments();
  }, []);

  const fetchSyncLogs = async (id) => {
    const res = await fetch(`${apiBase}/admin/tournaments/${id}/sync-logs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;
    const rows = await res.json();
    const lastStats = rows.find(r => r.type === 'stats');
    const lastTournament = rows.find(r => r.type === 'tournament');
    setSyncLogs(prev => ({ ...prev, [id]: { stats: lastStats || null, tournament: lastTournament || null } }));
  };

  const toggleAutoSync = async (id, type, currentVal) => {
    const enabled = !currentVal;
    const res = await fetch(`${apiBase}/admin/tournaments/${id}/auto-sync`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, enabled })
    });
    if (res.ok) {
      const col = type === 'stats' ? 'auto_sync_stats' : 'auto_sync_tournament';
      setAutoSyncToggles(prev => ({ ...prev, [`${id}_${type}`]: enabled }));
      setAllTournaments(prev => prev.map(t => t.id === id ? { ...t, [col]: enabled ? 1 : 0 } : t));
      if (enabled) fetchSyncLogs(id);
    }
  };

  useEffect(() => {
    allTournaments.filter(t => t.status === 'active').forEach(t => {
      fetchSyncLogs(t.id);
    });
  }, [allTournaments.length]);

  useEffect(() => {
    const activeSyncing = allTournaments.filter(
      t => t.status === 'active' && (t.auto_sync_stats || t.auto_sync_tournament)
    );
    if (activeSyncing.length === 0) return;
    const interval = setInterval(() => {
      activeSyncing.forEach(t => fetchSyncLogs(t.id));
    }, 10000);
    return () => clearInterval(interval);
  }, [allTournaments]);

  const updateTournamentStatus = async (id, patch) => {
    setTournamentStatusMsg('');
    const res = await fetch(`${apiBase}/admin/tournaments/${id}/status`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    if (res.ok) {
      fetchAllTournaments();
      setTournamentStatusMsg('✅ Updated');
      setTimeout(() => setTournamentStatusMsg(''), 2000);
    }
  };

  // ── Tournament Sync ───────────────────────────────────────────────────────

  const fetchTournamentMatches = async () => {
    if (!tournamentId.trim()) {
      setTournamentMessage('Please enter a valid Tournament ID');
      return;
    }
    setTournamentFetching(true);
    setTournamentMessage('');
    setTournamentMatches(null);
    try {
      const res = await fetch(`${apiBase}/admin/tournament/${tournamentId.trim()}/matches`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setTournamentMessage(data.message || 'Failed to fetch matches');
      } else {
        setTournamentMatches(data);
      }
    } catch {
      setTournamentMessage('Network error');
    } finally {
      setTournamentFetching(false);
    }
  };

  const syncTournament = async () => {
    if (!tournamentId.trim()) return;
    setTournamentSyncing(true);
    setTournamentMessage('');
    try {
      const res = await fetch(`${apiBase}/admin/sync-tournament/${tournamentId.trim()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setTournamentMessage(data.message || 'Sync failed');
      } else {
        setTournamentMessage(
          `✅ Sync complete: ${data.teams} teams, ${data.players} players, ${data.matches} matches`
        );
        fetchStats();
      }
    } catch {
      setTournamentMessage('Network error');
    } finally {
      setTournamentSyncing(false);
    }
  };

  const calculatePrices = async () => {
    if (!tournamentId.trim()) return;
    setPricesCalculating(true);
    setTournamentMessage('');
    try {
      const res = await fetch(`${apiBase}/admin/calculate-prices/${tournamentId.trim()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setTournamentMessage(data.message || 'Price calculation failed');
      } else {
        setTournamentMessage(`✅ Prices calculated for ${data.calculated} players`);
      }
    } catch {
      setTournamentMessage('Network error');
    } finally {
      setPricesCalculating(false);
    }
  };

  const syncStats = async () => {
    if (!tournamentId.trim()) return;
    setStatsSyncing(true);
    setTournamentMessage('');
    try {
      const res = await fetch(`${apiBase}/admin/sync-stats/${tournamentId.trim()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setTournamentMessage(data.message || 'Stats sync failed');
      } else {
        setTournamentMessage(
          `✅ Stats synced: ${data.seriesSynced} series synced, ${data.seriesSkipped} unfinished, ${data.seriesFailed} errors (total: ${data.totalSeries})`
        );
        fetchStats();
      }
    } catch {
      setTournamentMessage('Network error');
    } finally {
      setStatsSyncing(false);
    }
  };

  // ── Tournament Banner ─────────────────────────────────────────────────────

  const saveBanner = async () => {
    if (!bannerTournamentId || !bannerFile) return;
    setBannerSaving(true);
    setBannerMessage('');
    try {
      const formData = new FormData();
      formData.append('banner', bannerFile);
      const res = await fetch(`${apiBase}/admin/tournaments/${bannerTournamentId}/banner`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        setBannerMessage('✅ Banner saved');
        setBannerPreview(data.banner_url);
        setBannerFile(null);
      } else {
        setBannerMessage(data.message || 'Failed to save banner');
      }
    } catch {
      setBannerMessage('Network error');
    } finally {
      setBannerSaving(false);
    }
  };

  // ── Price Breakdown ───────────────────────────────────────────────────────

  const loadPriceBreakdown = async () => {
    if (!breakdownTournamentId.trim()) return;
    setBreakdownLoading(true);
    setBreakdownMessage('');
    setBreakdownData(null);
    setExpandedBreakdown(null);
    try {
      const res = await fetch(`${apiBase}/admin/tournament/${breakdownTournamentId.trim()}/price-breakdown`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setBreakdownMessage(data.message || 'Failed to load breakdown');
      } else if (data.players.length === 0) {
        setBreakdownMessage('No active players found for this tournament.');
      } else {
        setBreakdownData(data);
      }
    } catch {
      setBreakdownMessage('Network error');
    } finally {
      setBreakdownLoading(false);
    }
  };

  // ── Player Management ─────────────────────────────────────────────────────

  const loadPlayers = async () => {
    if (!manageTournamentId.trim()) {
      setPlayersMessage('Please enter a Tournament ID');
      return;
    }
    setPlayersLoading(true);
    setPlayersMessage('');
    setPlayerTeams([]);
    setExpandedPlayer(null);
    setPlayerAliases({});
    try {
      const res = await fetch(`${apiBase}/admin/tournament/${manageTournamentId.trim()}/players`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setPlayersMessage(data.message || 'Error');
      } else if (data.length === 0) {
        setPlayersMessage('No players found for this tournament.');
      } else {
        setPlayerTeams(data);
      }
    } catch {
      setPlayersMessage('Network error');
    } finally {
      setPlayersLoading(false);
    }
  };

  const toggleActive = async (playerId, currentActive) => {
    try {
      const res = await fetch(`${apiBase}/admin/players/${playerId}/active`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: currentActive === 1 ? 0 : 1 })
      });
      if (res.ok) {
        setPlayerTeams(prev => prev.map(team => ({
          ...team,
          players: team.players.map(p =>
            p.id === playerId ? { ...p, is_active: currentActive === 1 ? 0 : 1 } : p
          )
        })));
      }
    } catch { /* silent */ }
  };

  const loadAliases = async (playerId) => {
    if (playerAliases[playerId]) return; // already loaded
    try {
      const res = await fetch(`${apiBase}/admin/players/${playerId}/aliases`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPlayerAliases(prev => ({ ...prev, [playerId]: data }));
      }
    } catch { /* silent */ }
  };

  const expandPlayer = (playerId) => {
    if (expandedPlayer === playerId) {
      setExpandedPlayer(null);
    } else {
      setExpandedPlayer(playerId);
      loadAliases(playerId);
    }
  };

  const addAlias = async (playerId) => {
    const alias = (newAlias[playerId] || '').trim();
    if (!alias) return;
    try {
      const res = await fetch(`${apiBase}/admin/players/${playerId}/aliases`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias })
      });
      if (res.ok) {
        const created = await res.json();
        setPlayerAliases(prev => ({
          ...prev,
          [playerId]: [...(prev[playerId] || []), created]
        }));
        setNewAlias(prev => ({ ...prev, [playerId]: '' }));
      }
    } catch { /* silent */ }
  };

  const deleteAlias = async (playerId, aliasId) => {
    try {
      const res = await fetch(`${apiBase}/admin/player-aliases/${aliasId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setPlayerAliases(prev => ({
          ...prev,
          [playerId]: (prev[playerId] || []).filter(a => a.id !== aliasId)
        }));
      }
    } catch { /* silent */ }
  };

  return (
    <div className="admin-grid">
      {/* ── Tournament Sync ── */}
      <section className="panel tournament-panel">
        <h2>Grid API — Tournament Sync</h2>
        <label>
          Tournament ID
          <div className="scenario-row">
            <input
              type="number"
              placeholder="e.g. 828925"
              value={tournamentId}
              onChange={e => setTournamentId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchTournamentMatches()}
              style={{ width: '160px' }}
            />
            <button
              type="button"
              className="btn-outlined small"
              onClick={fetchTournamentMatches}
              disabled={tournamentFetching}
            >
              {tournamentFetching ? 'Loading...' : 'Preview'}
            </button>
            {tournamentMatches && (
              <button
                type="button"
                className="btn-primary small"
                onClick={syncTournament}
                disabled={tournamentSyncing}
              >
                {tournamentSyncing ? 'Syncing...' : 'Sync Tournament'}
              </button>
            )}
            {tournamentId && (
              <button
                type="button"
                className="btn-outlined small"
                onClick={syncStats}
                disabled={statsSyncing}
                title="Sync statistics for finished matches and recalculate fantasy points"
              >
                {statsSyncing ? 'Sync stats...' : 'Sync Stats'}
              </button>
            )}
            {tournamentId && (
              <button
                type="button"
                className="btn-outlined small"
                onClick={calculatePrices}
                disabled={pricesCalculating}
                title="Recalculate player prices for the active tournament based on history"
              >
                {pricesCalculating ? 'Calculating...' : 'Calculate Prices'}
              </button>
            )}
          </div>
        </label>

        {tournamentMessage && <p className="info-text">{tournamentMessage}</p>}

        {tournamentMatches && (
          <>
            <p className="muted" style={{ margin: '0.5rem 0 0.4rem' }}>
              {tournamentMatches.matches[0]?.tournament?.name && (
                <strong>{tournamentMatches.matches[0].tournament.name}</strong>
              )}{' '}
              — {tournamentMatches.totalCount} matches found
            </p>
            <div className="tournament-matches-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Match</th>
                    <th>Format</th>
                    <th>Scheduled (UTC+3)</th>
                  </tr>
                </thead>
                <tbody>
                  {tournamentMatches.matches.map((m, i) => (
                    <tr key={m.id}>
                      <td className="muted">{i + 1}</td>
                      <td>{m.teams.length >= 2 ? `${m.teams[0]} vs ${m.teams[1]}` : m.teams[0] || '—'}</td>
                      <td>{m.format || '—'}</td>
                      <td>{formatScheduledTime(m.scheduledAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {/* ── Stats ── */}
      <section className="panel">
        <h2>Statistics</h2>
        {stats ? (
          <ul className="stats-list">
            <li><strong>Total Users:</strong> {stats.total_users}</li>
            <li><strong>Total Tournaments:</strong> {stats.total_tournaments}</li>
            <li><strong>Total Players Synced:</strong> {stats.total_players}</li>
            <li><strong>Total Leagues:</strong> {stats.total_leagues}</li>
            <li><strong>Total Fantasy Teams:</strong> {stats.total_fantasy_teams}</li>
          </ul>
        ) : (
          <p className="muted">Loading stats...</p>
        )}
      </section>

      {/* ── Tournament Banner ── */}
      <section className="panel">
        <h2>Tournament Banner</h2>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Set a banner image URL for each tournament. Shown on the tournament card in My Fantasy.
        </p>
        <label>
          Tournament
          <select
            value={bannerTournamentId}
            onChange={e => {
              setBannerTournamentId(e.target.value);
              const t = allTournaments.find(t => String(t.id) === e.target.value);
              setBannerFile(null);
              setBannerPreview(t?.banner_url || '');
              setBannerMessage('');
            }}
          >
            {allTournaments.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </label>
        <label>
          Banner Image
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
              const url = URL.createObjectURL(file);
              objectUrlRef.current = url;
              setBannerFile(file);
              setBannerPreview(url);
              setBannerMessage('');
            }}
            style={{ padding: '0.3rem 0' }}
          />
        </label>
        {bannerPreview && (
          <div style={{ marginBottom: '0.75rem' }}>
            <img
              src={bannerPreview}
              alt="Banner preview"
              style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}
            />
          </div>
        )}
        <button
          type="button"
          className="btn-primary small"
          onClick={saveBanner}
          disabled={bannerSaving || !bannerTournamentId || !bannerFile}
        >
          {bannerSaving ? 'Uploading...' : 'Upload Banner'}
        </button>
        {bannerMessage && <p className="info-text" style={{ marginTop: '0.5rem' }}>{bannerMessage}</p>}
      </section>

      {/* ── Manage Players ── */}
      <section className="panel manage-players-panel">
        <h2>Manage Players</h2>
        <div className="scenario-row" style={{ marginBottom: '0.75rem' }}>
          <input
            type="number"
            placeholder="Tournament ID"
            value={manageTournamentId}
            onChange={e => setManageTournamentId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadPlayers()}
            style={{ width: '160px' }}
          />
          <button
            type="button"
            className="btn-outlined small"
            onClick={loadPlayers}
            disabled={playersLoading}
          >
            {playersLoading ? 'Loading...' : 'Load Players'}
          </button>
        </div>

        {playersMessage && <p className="info-text">{playersMessage}</p>}

        {playerTeams.map(team => (
          <div key={team.team_name} className="player-team-block">
            <div className="player-team-header">{team.team_name}</div>
            {team.players.map(player => (
              <div key={player.id} className="player-manage-row">
                <div className="player-manage-main">
                  <span
                    className={`player-active-badge ${player.is_active ? 'active' : 'inactive'}`}
                    title={player.is_active ? 'Active' : 'Inactive'}
                  >
                    {player.is_active ? '●' : '○'}
                  </span>
                  <span className="player-manage-name">{player.nickname}</span>
                  <button
                    type="button"
                    className="btn-tiny"
                    onClick={() => toggleActive(player.id, player.is_active)}
                  >
                    {player.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    className="btn-tiny btn-ghost"
                    onClick={() => expandPlayer(player.id)}
                  >
                    {expandedPlayer === player.id ? 'Hide' : 'Aliases'}
                  </button>
                </div>

                {expandedPlayer === player.id && (
                  <div className="player-aliases-box">
                    {(playerAliases[player.id] || []).length === 0 ? (
                      <span className="muted" style={{ fontSize: '0.8rem' }}>No aliases</span>
                    ) : (
                      <div className="alias-list">
                        {(playerAliases[player.id] || []).map(a => (
                          <span key={a.id} className="alias-chip">
                            {a.alias}
                            <button
                              type="button"
                              className="alias-delete"
                              onClick={() => deleteAlias(player.id, a.id)}
                              title="Delete alias"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="alias-add-row">
                      <input
                        type="text"
                        placeholder="Add alias..."
                        value={newAlias[player.id] || ''}
                        onChange={e => setNewAlias(prev => ({ ...prev, [player.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addAlias(player.id)}
                      />
                      <button
                        type="button"
                        className="btn-tiny"
                        onClick={() => addAlias(player.id)}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* ── Manage Tournaments ── */}
      <section className="panel" style={{ gridColumn: '1 / -1', padding: '1.5rem 2rem' }}>
        <h2>Manage Tournaments</h2>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Mark tournaments as finished (Historical) or temporarily hide them from users while setting up the active tournament (deactivating players, calculating prices, etc.).
        </p>
        {tournamentStatusMsg && <p className="info-text" style={{ marginBottom: '0.5rem' }}>{tournamentStatusMsg}</p>}
        <table style={{ width: '100%', fontSize: '0.9rem', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.5rem 0.75rem 0.5rem 0' }}>Tournament</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Status</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Visible</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Lock Time</th>
              <th style={{ padding: '0.5rem 0.75rem' }}>Auto-Sync</th>
              <th style={{ padding: '0.5rem 0 0.5rem 0.75rem' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {allTournaments.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <td style={{ padding: '0.85rem 0.75rem 0.85rem 0' }}>
                  <span style={{ fontWeight: 600 }}>{t.name}</span>
                  <span className="muted" style={{ marginLeft: '0.5rem', fontSize: '0.75rem' }}>#{t.id}</span>
                </td>
                <td style={{ textAlign: 'center', padding: '0.85rem 0.75rem' }}>
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 700, padding: '0.15rem 0.5rem',
                    borderRadius: 4,
                    background: t.status === 'active' ? 'rgba(96,230,184,0.12)' : 'rgba(160,80,255,0.12)',
                    color: t.status === 'active' ? '#60e6b8' : '#c084fc',
                    border: `1px solid ${t.status === 'active' ? 'rgba(96,230,184,0.3)' : 'rgba(160,80,255,0.3)'}`
                  }}>
                    {t.status === 'active' ? 'Active' : 'Historical'}
                  </span>
                </td>
                <td style={{ textAlign: 'center', padding: '0.85rem 0.75rem' }}>
                  <span style={{ fontSize: '0.85rem' }}>{t.is_visible === 0 ? '🔒 Hidden' : '👁 Visible'}</span>
                </td>
                <td style={{ textAlign: 'center', padding: '0.85rem 0.75rem' }}>
                  {t.status === 'active' ? (
                    t.lock_time
                      ? <span style={{ fontSize: '0.75rem', color: '#c084fc' }}>
                          {parseUTC(t.lock_time).toLocaleString('en-GB', { timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      : <span className="muted" style={{ fontSize: '0.75rem' }}>Not synced</span>
                  ) : (
                    <span className="muted" style={{ fontSize: '0.75rem' }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: 'center', minWidth: '180px', padding: '0.85rem 0.75rem' }}>
                  {t.status === 'active' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'center' }}>
                      {/* Stats toggle */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', width: '100%' }}>
                        <button
                          className={`btn-tiny${t.auto_sync_stats ? ' btn-active-sync' : ' btn-ghost'}`}
                          onClick={() => toggleAutoSync(t.id, 'stats', t.auto_sync_stats)}
                        >
                          {t.auto_sync_stats ? '⏸ Stats ON' : '▶ Stats OFF'}
                        </button>
                        {syncLogs[t.id]?.stats && (
                          <span style={{ fontSize: '0.65rem', opacity: 0.7, textAlign: 'center' }}>
                            {syncLogs[t.id].stats.status === 'success' ? '✓' : '✗'} {parseUTC(syncLogs[t.id].stats.ran_at).toLocaleTimeString('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            {syncLogs[t.id].stats.status === 'error' && (
                              <span style={{ color: '#ff6b81', marginLeft: '0.25rem' }}>{syncLogs[t.id].stats.message}</span>
                            )}
                          </span>
                        )}
                      </div>
                      {/* Tournament toggle */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem', width: '100%' }}>
                        <button
                          className={`btn-tiny${t.auto_sync_tournament ? ' btn-active-sync' : ' btn-ghost'}`}
                          onClick={() => toggleAutoSync(t.id, 'tournament', t.auto_sync_tournament)}
                        >
                          {t.auto_sync_tournament ? '⏸ Tournament ON' : '▶ Tournament OFF'}
                        </button>
                        {syncLogs[t.id]?.tournament && (
                          <span style={{ fontSize: '0.65rem', opacity: 0.7, textAlign: 'center' }}>
                            {syncLogs[t.id].tournament.status === 'success' ? '✓' : '✗'} {parseUTC(syncLogs[t.id].tournament.ran_at).toLocaleTimeString('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            {syncLogs[t.id].tournament.status === 'error' && (
                              <span style={{ color: '#ff6b81', marginLeft: '0.25rem' }}>{syncLogs[t.id].tournament.message}</span>
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span className="muted" style={{ fontSize: '0.75rem' }}>—</span>
                  )}
                </td>
                <td style={{ textAlign: 'right', padding: '0.85rem 0 0.85rem 0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                    {t.status === 'active' && (
                      <button
                        className="btn-tiny"
                        onClick={() => {
                          if (window.confirm(`Mark "${t.name}" as finished? It will appear in Finished Tournaments.`))
                            updateTournamentStatus(t.id, { status: 'historical' });
                        }}
                      >
                        Mark Finished
                      </button>
                    )}
                    {t.status === 'historical' && (
                      <button
                        className="btn-tiny btn-ghost"
                        onClick={() => updateTournamentStatus(t.id, { status: 'active' })}
                      >
                        Reactivate
                      </button>
                    )}
                    {t.status === 'active' && (
                      <button
                        className="btn-tiny btn-ghost"
                        onClick={() => updateTournamentStatus(t.id, { is_visible: t.is_visible === 0 ? 1 : 0 })}
                        title={t.is_visible === 0 ? 'Make tournament visible to users' : 'Hide tournament from users while setting up'}
                      >
                        {t.is_visible === 0 ? 'Unhide' : 'Hide'}
                      </button>
                    )}
                    <button
                      className="btn-tiny btn-danger-sm"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${t.name}"? All statistics, teams and associated series will be removed.`)) return;
                        const res = await fetch(`${apiBase}/admin/tournaments/${t.id}`, {
                          method: 'DELETE',
                          headers: { Authorization: `Bearer ${token}` }
                        });
                        if (res.ok) { fetchAllTournaments(); fetchStats(); }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── Price Breakdown ── */}
      <section className="panel price-breakdown-panel">
        <h2>Player Price Breakdown</h2>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Details on how each active player's price was calculated for the tournament.
        </p>
        <div className="scenario-row" style={{ marginBottom: '0.75rem' }}>
          <input
            type="number"
            placeholder="Tournament ID"
            value={breakdownTournamentId}
            onChange={e => setBreakdownTournamentId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadPriceBreakdown()}
            style={{ width: '160px' }}
          />
          <button type="button" className="btn-outlined small" onClick={loadPriceBreakdown} disabled={breakdownLoading}>
            {breakdownLoading ? 'Loading...' : 'Load Breakdown'}
          </button>
        </div>

        {breakdownMessage && <p className="info-text">{breakdownMessage}</p>}

        {breakdownData && (
          <>
            <div className="breakdown-roster-summary">
              <span className="muted" style={{ fontSize: '0.8rem' }}>
                {breakdownData.players.length}{' '}active players &nbsp;·&nbsp;
                Min score: <strong>{breakdownData.min_score?.toFixed(2) ?? '—'}</strong> &nbsp;·&nbsp;
                Max score: <strong>{breakdownData.max_score?.toFixed(2) ?? '—'}</strong>
              </span>
            </div>

            <div className="breakdown-player-list">
              {breakdownData.players.map(player => {
                const isOpen = expandedBreakdown === player.id;
                const range = breakdownData.max_score - breakdownData.min_score;
                return (
                  <div key={player.id} className="breakdown-player-row">
                    <div
                      className="breakdown-player-header"
                      onClick={() => setExpandedBreakdown(isOpen ? null : player.id)}
                    >
                      <span className="breakdown-player-name">{player.nickname}</span>
                      <span className="muted breakdown-player-team">{player.team_name}</span>
                      <span className="breakdown-score muted">
                        {player.score !== null ? `score: ${player.score.toFixed(2)}` : 'no history'}
                      </span>
                      <span className="breakdown-price">{Math.round((player.price || 190000) / 1000)}K</span>
                      <span className="breakdown-chevron">{isOpen ? '▴' : '▾'}</span>
                    </div>

                    {isOpen && (
                      <div className="breakdown-detail">
                        {player.tournaments_used.length === 0 ? (
                          <p className="muted" style={{ fontSize: '0.82rem', margin: '0.25rem 0' }}>
                            No previous tournaments — default price 190K.
                          </p>
                        ) : (
                          <>
                            {player.tournaments_used.map((t, idx) => {
                              const weight = player.tournaments_used.length === 1 ? 1 : idx === 0 ? 0.65 : 0.35;
                              return (
                                <div key={t.id} className="breakdown-tournament-block">
                                  <div className="breakdown-tournament-title">
                                    {t.name}
                                    <span className="breakdown-weight">{Math.round(weight * 100)}% weight</span>
                                    <span className="muted" style={{ fontSize: '0.78rem' }}>avg: {t.avg.toFixed(2)} pts/series</span>
                                  </div>
                                  <table className="breakdown-series-table">
                                    <thead>
                                      <tr>
                                        <th>Match</th>
                                        <th>Format</th>
                                        <th>Date</th>
                                        <th>Pts</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {t.series.map(s => (
                                        <tr key={s.series_id}>
                                          <td className="muted">
                                            {s.team1_name && s.team2_name
                                              ? `${s.team1_name} vs ${s.team2_name}`
                                              : `Series ${s.series_id.slice(0, 8)}`}
                                          </td>
                                          <td className="muted">{s.format || '—'}</td>
                                          <td className="muted">
                                            {s.scheduled_at
                                              ? parseUTC(s.scheduled_at).toLocaleString('en-GB', { timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short' })
                                              : '—'}
                                          </td>
                                          <td className={s.pts >= 0 ? 'pts-pos' : 'pts-neg'}>
                                            {s.pts >= 0 ? '+' : ''}{s.pts}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              );
                            })}

                            <div className="breakdown-formula">
                              {player.tournaments_used.length === 2 ? (
                                <span>
                                  Weighted avg: {player.tournaments_used[0].avg.toFixed(2)} × 0.65 + {player.tournaments_used[1].avg.toFixed(2)} × 0.35 = <strong>{player.score.toFixed(2)}</strong>
                                </span>
                              ) : (
                                <span>Avg (1 tournament): <strong>{player.score.toFixed(2)}</strong></span>
                              )}
                              <span className="breakdown-formula-price">
                                {range > 0 ? (
                                  <>
                                    170K + ({player.score.toFixed(2)} − {breakdownData.min_score.toFixed(2)}) / ({breakdownData.max_score.toFixed(2)} − {breakdownData.min_score.toFixed(2)}) × 70K = <strong>{Math.round((player.price || 190000) / 1000)}K</strong>
                                  </>
                                ) : (
                                  <>All players have the same score → <strong>205K</strong></>
                                )}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

    </div>
  );
}

export default AdminDashboard;
