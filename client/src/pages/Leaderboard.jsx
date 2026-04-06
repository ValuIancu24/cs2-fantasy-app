import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App.jsx';
import { FlagImg } from '../utils/flag.jsx';
import '../styles/leaderboard.css';

function Leaderboard() {
  const { apiBase, user } = useContext(AuthContext);
  const [leagueId, setLeagueId] = useState('');
  const [leagues, setLeagues] = useState([]);
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);

  const token = localStorage.getItem('cs2_fantasy_token');

  useEffect(() => {
    const loadLeagues = async () => {
      const res = await fetch(`${apiBase}/leagues`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const l = await res.json();
      setLeagues(l);
      if (l.length > 0) {
        setLeagueId(l[0].id);
      }
    };
    loadLeagues();
  }, [apiBase, token]);

  useEffect(() => {
    if (!leagueId) return;
    const load = async () => {
      const res = await fetch(
        `${apiBase}/fantasy-teams/league/${leagueId}/leaderboard?page=${page}&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    };
    load();
  }, [leagueId, page, apiBase, token]);


  return (
    <div className="leaderboard-page">
    <div className="panel leaderboard">
      <h2>League Leaderboard</h2>
      <div className="leaderboard-controls">
        <select value={leagueId} onChange={e => setLeagueId(e.target.value)}>
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
            <th>Total</th>
            <th>Rating</th>
            <th>Team</th>
          </tr>
        </thead>
        <tbody>
          {data &&
            data.teams.map((t, idx) => {
              const rank = (data.page - 1) * data.limit + idx + 1;
              const isUser = user && t.user_id === user.id;
              return (
                <tr key={t.id} className={isUser ? 'highlight-row' : ''}>
                  <td>{rank}</td>
                  <td>
                    <FlagImg code={t.country_code} style={{ marginRight: 6 }} /> {t.username}
                  </td>
                  <td>{t.team_name}</td>
                  <td>{t.total_points}</td>
                  <td>{t.rating_points}</td>
                  <td>{t.team_points}</td>
                </tr>
              );
            })}
        </tbody>
      </table>

      {data && (
        <div className="pagination">
          <button
            className="btn-outlined small"
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Prev
          </button>
          <span>
            Page {page} of {Math.max(1, Math.ceil(data.total / data.limit))}
          </span>
          <button
            className="btn-outlined small"
            type="button"
            onClick={() => {
              const maxPage = Math.max(1, Math.ceil(data.total / data.limit));
              setPage(p => Math.min(maxPage, p + 1));
            }}
            disabled={page * data.limit >= data.total}
          >
            Next
          </button>
        </div>
      )}
    </div>
    </div>
  );
}

export default Leaderboard;

