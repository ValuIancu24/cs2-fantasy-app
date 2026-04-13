import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App.jsx';
import '../styles/admin.css';

function formatScheduledTime(isoString) {
  if (!isoString) return 'TBD';
  const date = new Date(isoString);
  return date.toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short' });
}

function AdminDashboard() {
  const { apiBase } = useContext(AuthContext);
  const [stats, setStats] = useState(null);

  const [tournamentId, setTournamentId] = useState('');
  const [tournamentMatches, setTournamentMatches] = useState(null);
  const [tournamentFetching, setTournamentFetching] = useState(false);
  const [tournamentSyncing, setTournamentSyncing] = useState(false);
  const [statsSyncing, setStatsSyncing] = useState(false);
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

  // Wipe
  const [wiping, setWiping] = useState(false);
  const [wipeMessage, setWipeMessage] = useState('');

  const token = localStorage.getItem('cs2_fantasy_token');

  const fetchStats = async () => {
    const res = await fetch(`${apiBase}/admin/stats`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) setStats(await res.json());
  };

  useEffect(() => {
    fetchStats();
    fetch(`${apiBase}/tournaments/active`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setActiveTournaments(data);
          setBannerTournamentId(String(data[0].id));
          setBannerPreview(data[0].banner_url || '');
        }
      })
      .catch(() => {});
  }, []);

  // ── Tournament Sync ───────────────────────────────────────────────────────

  const fetchTournamentMatches = async () => {
    if (!tournamentId.trim()) {
      setTournamentMessage('Introdu un Tournament ID valid');
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
        setTournamentMessage(data.message || 'Eroare la preluarea meciurilor');
      } else {
        setTournamentMatches(data);
      }
    } catch {
      setTournamentMessage('Eroare de rețea');
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
        setTournamentMessage(data.message || 'Sync eșuat');
      } else {
        setTournamentMessage(
          `✅ Sync complet: ${data.teams} echipe, ${data.players} jucători, ${data.matches} meciuri`
        );
        fetchStats();
      }
    } catch {
      setTournamentMessage('Eroare de rețea');
    } finally {
      setTournamentSyncing(false);
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
        setTournamentMessage(data.message || 'Stats sync eșuat');
      } else {
        setTournamentMessage(
          `✅ Stats sync: ${data.seriesSynced} serii sincronizate, ${data.seriesSkipped} neterminate, ${data.seriesFailed} erori (total: ${data.totalSeries})`
        );
        fetchStats();
      }
    } catch {
      setTournamentMessage('Eroare de rețea');
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
      setBannerMessage('Eroare de rețea');
    } finally {
      setBannerSaving(false);
    }
  };

  // ── Wipe ──────────────────────────────────────────────────────────────────

  const wipeTournamentData = async () => {
    if (!window.confirm('Ești sigur? Aceasta va șterge TOATE datele de turneu (jucători, echipe, statistici, lineup-uri).')) return;
    setWiping(true);
    setWipeMessage('');
    try {
      const res = await fetch(`${apiBase}/admin/wipe-tournament-data`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setWipeMessage(data.message || 'Wipe eșuat');
      } else {
        setWipeMessage('✅ ' + data.message);
        setPlayerTeams([]);
        fetchStats();
      }
    } catch {
      setWipeMessage('Eroare de rețea');
    } finally {
      setWiping(false);
    }
  };

  // ── Player Management ─────────────────────────────────────────────────────

  const loadPlayers = async () => {
    if (!manageTournamentId.trim()) {
      setPlayersMessage('Introdu un Tournament ID');
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
        setPlayersMessage(data.message || 'Eroare');
      } else if (data.length === 0) {
        setPlayersMessage('Nu s-au găsit jucători pentru acest turneu.');
      } else {
        setPlayerTeams(data);
      }
    } catch {
      setPlayersMessage('Eroare de rețea');
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
              placeholder="ex: 828925"
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
              {tournamentFetching ? 'Se încarcă...' : 'Previzualizează'}
            </button>
            {tournamentMatches && (
              <button
                type="button"
                className="btn-primary small"
                onClick={syncTournament}
                disabled={tournamentSyncing}
              >
                {tournamentSyncing ? 'Se sincronizează...' : 'Sync Turneu'}
              </button>
            )}
            {tournamentId && (
              <button
                type="button"
                className="btn-outlined small"
                onClick={syncStats}
                disabled={statsSyncing}
                title="Sincronizează statisticile meciurilor terminate și recalculează punctele fantasy"
              >
                {statsSyncing ? 'Sync stats...' : 'Sync Stats'}
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
              — {tournamentMatches.totalCount} meciuri găsite
            </p>
            <div className="tournament-matches-table">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Meci</th>
                    <th>Format</th>
                    <th>Programat (RO)</th>
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
              const t = activeTournaments.find(t => String(t.id) === e.target.value);
              setBannerFile(null);
              setBannerPreview(t?.banner_url || '');
              setBannerMessage('');
            }}
          >
            {activeTournaments.map(t => (
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
              setBannerFile(file);
              setBannerPreview(URL.createObjectURL(file));
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
              style={{ width: '100%', maxHeight: 130, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}
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
            {playersLoading ? 'Se încarcă...' : 'Încarcă Jucători'}
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
                    title={player.is_active ? 'Activ' : 'Inactiv'}
                  >
                    {player.is_active ? '●' : '○'}
                  </span>
                  <span className="player-manage-name">{player.nickname}</span>
                  <button
                    type="button"
                    className="btn-tiny"
                    onClick={() => toggleActive(player.id, player.is_active)}
                  >
                    {player.is_active ? 'Dezactivează' : 'Activează'}
                  </button>
                  <button
                    type="button"
                    className="btn-tiny btn-ghost"
                    onClick={() => expandPlayer(player.id)}
                  >
                    {expandedPlayer === player.id ? 'Ascunde' : 'Alias-uri'}
                  </button>
                </div>

                {expandedPlayer === player.id && (
                  <div className="player-aliases-box">
                    {(playerAliases[player.id] || []).length === 0 ? (
                      <span className="muted" style={{ fontSize: '0.8rem' }}>Niciun alias</span>
                    ) : (
                      <div className="alias-list">
                        {(playerAliases[player.id] || []).map(a => (
                          <span key={a.id} className="alias-chip">
                            {a.alias}
                            <button
                              type="button"
                              className="alias-delete"
                              onClick={() => deleteAlias(player.id, a.id)}
                              title="Șterge alias"
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
                        placeholder="Adaugă alias..."
                        value={newAlias[player.id] || ''}
                        onChange={e => setNewAlias(prev => ({ ...prev, [player.id]: e.target.value }))}
                        onKeyDown={e => e.key === 'Enter' && addAlias(player.id)}
                      />
                      <button
                        type="button"
                        className="btn-tiny"
                        onClick={() => addAlias(player.id)}
                      >
                        Adaugă
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </section>

      {/* ── Danger Zone ── */}
      <section className="panel danger-zone">
        <h2>Danger Zone</h2>
        <p className="muted" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
          Șterge toate datele de turneu (jucători, echipe, statistici, serii) și resetează lineup-urile fantasy la zero.
        </p>
        <button
          type="button"
          className="btn-danger"
          onClick={wipeTournamentData}
          disabled={wiping}
        >
          {wiping ? 'Se șterge...' : 'Wipe Tournament Data'}
        </button>
        {wipeMessage && <p className="info-text" style={{ marginTop: '0.5rem' }}>{wipeMessage}</p>}
      </section>
    </div>
  );
}

export default AdminDashboard;
