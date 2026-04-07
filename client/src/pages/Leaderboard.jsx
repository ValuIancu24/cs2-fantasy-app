import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App.jsx';
import { FlagImg } from '../utils/flag.jsx';
import '../styles/leaderboard.css';

const LIMIT = 6;

function Leaderboard() {
  const { apiBase, user } = useContext(AuthContext);
  const [leagueId, setLeagueId] = useState('');
  const [leagues, setLeagues] = useState([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [userPage, setUserPage] = useState(null);

  const token = localStorage.getItem('cs2_fantasy_token');

  useEffect(() => {
    const loadLeagues = async () => {
      const res = await fetch(`${apiBase}/leagues`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const l = await res.json();
      setLeagues(l);
      if (l.length > 0) setLeagueId(l[0].id);
    };
    loadLeagues();
  }, [apiBase, token]);

  // When league changes, reset and auto-jump to user's page
  useEffect(() => {
    if (!leagueId) return;
    setData(null);
    setUserPage(null);

    // Fetch page 1 first to get userRank
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
        <h2>League Leaderboard</h2>
        <div className="leaderboard-controls">
          <select value={leagueId} onChange={e => { setLeagueId(e.target.value); setPage(1); }}>
            {leagues.map(l => (
              <option key={l.id} value={l.id}>
                {l.name} (#{l.id})
              </option>
            ))}
          </select>
        </div>

        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Manager</th>
              <th>Team</th>
              <th>Points</th>
              <th>Team Pts</th>
              <th>Total</th>
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
                  <td>{t.rating_points}</td>
                  <td className={t.team_points >= 0 ? 'pts-positive' : 'pts-negative'}>
                    {t.team_points >= 0 ? '+' : ''}{t.team_points}
                  </td>
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
      </div>
    </div>
  );
}

export default Leaderboard;
