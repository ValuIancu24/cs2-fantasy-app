import React, { useContext, useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { FlagImg } from '../utils/flag.jsx';
import SearchableSelect from '../components/SearchableSelect.jsx';
import '../styles/leaderboard.css';

const LIMIT = 6;

function Leaderboard() {
  const { tournamentId } = useParams();
  const { apiBase, user } = useContext(AuthContext);
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fromMyTeam = location.state?.from === 'my-team';
  const [leagueId, setLeagueId] = useState('');
  const [leagues, setLeagues] = useState([]);
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentBanner, setTournamentBanner] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [userPage, setUserPage] = useState(null);

  const token = localStorage.getItem('cs2_fantasy_token');

  useEffect(() => {
    const loadLeagues = async () => {
      const res = await fetch(`${apiBase}/leagues`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const all = await res.json();
      // Filter to only leagues for this tournament
      const filtered = (Array.isArray(all) ? all : []).filter(
        l => String(l.tournament_id) === String(tournamentId)
      );
      setLeagues(filtered);
      if (filtered.length > 0) {
        const paramLeague = searchParams.get('league');
        const match = paramLeague && filtered.find(x => String(x.id) === paramLeague);
        setLeagueId(match ? String(match.id) : String(filtered[0].id));
      }
    };
    loadLeagues();
  }, [apiBase, token, tournamentId]);

  useEffect(() => {
    if (!tournamentId) return;
    fetch(`${apiBase}/tournaments/${tournamentId}/info`)
      .then(r => r.ok ? r.json() : null)
      .then(t => { if (t?.name) setTournamentName(t.name); if (t?.banner_url) setTournamentBanner(t.banner_url); })
      .catch(() => {});
  }, [apiBase, tournamentId]);

  // When league changes, reset and auto-jump to user's page
  useEffect(() => {
    if (!leagueId) return;
    setData(null);
    setUserPage(null);

    const init = async () => {
      const res = await fetch(
        `${apiBase}/fantasy-teams/league/${leagueId}/leaderboard?page=1&limit=${LIMIT}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return;
      const d = await res.json();
      const uPage = d.userRank ? Math.ceil(d.userRank / LIMIT) : 1;
      setUserPage(uPage);
      setPage(uPage);
    };
    init();
  }, [leagueId]);

  useEffect(() => {
    if (!leagueId) return;
    const load = async () => {
      const res = await fetch(
        `${apiBase}/fantasy-teams/league/${leagueId}/leaderboard?page=${page}&limit=${LIMIT}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setData(await res.json());
    };
    load();
  }, [leagueId, page]);

  const maxPage = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div className="leaderboard-page">
      <div className="panel leaderboard">
        <div className="leaderboard-header-row">
          <button className="btn-text" type="button" onClick={() => fromMyTeam
            ? navigate(`/tournament/${tournamentId}/my-team?league=${leagueId}`)
            : navigate(`/tournament/${tournamentId}/leagues`)
          }>
            {fromMyTeam ? '← Back to My Team' : '← Back to Leagues'}
          </button>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {tournamentBanner && <img src={tournamentBanner} alt="" style={{ height: 28, width: 'auto', objectFit: 'contain', borderRadius: '4px' }} />}
            {tournamentName ? `${tournamentName} — Leaderboard` : 'League Leaderboard'}
          </h2>
        </div>

        <div className="leaderboard-controls">
          <SearchableSelect
            options={leagues.map(l => ({ value: l.id, label: l.name }))}
            value={leagueId}
            onChange={val => { setLeagueId(String(val)); setPage(1); setSearchParams({ league: String(val) }); }}
            placeholder="Select a league..."
          />
        </div>

        {leagues.length === 0 && (
          <p className="muted">You are not in any leagues for this tournament.</p>
        )}

        {leagues.length > 0 && (
          <>
            <table>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Manager</th>
                  <th>Team</th>
                  <th>Total Fantasy Points</th>
                </tr>
              </thead>
              <tbody>
                {data && data.teams.map((t, idx) => {
                  const rank = (data.page - 1) * LIMIT + idx + 1;
                  const isUser = user && t.user_id === user.id;
                  return (
                    <tr key={t.id} className={isUser ? 'highlight-row' : ''}>
                      <td className="rank-cell">
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                      </td>
                      <td>
                        <FlagImg code={t.country_code} style={{ marginRight: 6 }} />
                        {t.username}
                      </td>
                      <td>{t.team_name}</td>
                      <td><strong>{t.total_points}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {data && (
              <div className="pagination">
                <div className="pagination-nav">
                  <button className="btn-outlined small" type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    ← Prev
                  </button>
                  <span>Page {page} of {maxPage}</span>
                  <button className="btn-outlined small" type="button" onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page >= maxPage}>
                    Next →
                  </button>
                </div>
                <div className="pagination-shortcuts">
                  <button className="btn-outlined small" type="button" onClick={() => setPage(1)}>
                    Go to Top
                  </button>
                  <button className="btn-outlined small" type="button" onClick={() => setPage(userPage || 1)}>
                    Go to My Team
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default Leaderboard;
