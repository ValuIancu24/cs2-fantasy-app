import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import '../styles/matches.css';

function formatMatchDateTime(iso) {
  if (!iso) return { time: '—', date: '—', dateOnly: '—' };
  const d = new Date(iso);
  return {
    time: d.toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }),
    date: d.toLocaleString('en-GB', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    dateOnly: d.toLocaleDateString('en-GB', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'long', year: 'numeric' })
  };
}

function TeamLogoLg({ name, imageUrl }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="team-logo-lg">
      {imageUrl
        ? <img src={imageUrl} alt={name} />
        : initials}
    </div>
  );
}

function MatchDetail() {
  const { tournamentId, seriesId } = useParams();
  const { apiBase } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const fromPlayer = location.state?.from === 'player';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bannerUrl, setBannerUrl] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase}/matches/${seriesId}`).then(r => r.ok ? r.json() : null),
      fetch(`${apiBase}/tournaments/${tournamentId}/info`).then(r => r.ok ? r.json() : null)
    ])
      .then(([matchData, tournamentData]) => {
        if (matchData) setData(matchData);
        setBannerUrl(tournamentData?.banner_url || '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase, seriesId, tournamentId]);

  if (loading) return <p className="muted" style={{ padding: '1rem' }}>Loading match...</p>;
  if (!data) return <p className="muted" style={{ padding: '1rem' }}>Match not found.</p>;

  const { series, finished, teams } = data;
  const { time, date, dateOnly } = formatMatchDateTime(series.scheduled_at);
  const t1 = teams[0];
  const t2 = teams[1];
  const t1ImageUrl = t1?.image_url || series.team1_image_url || null;
  const t2ImageUrl = t2?.image_url || series.team2_image_url || null;

  return (
    <div className="match-detail-page">
      <div className="back-btn-row">
        {fromPlayer ? (
          <button className="btn-text" onClick={() => navigate(location.state.backUrl, { state: { scrollTo: location.state.scrollTo } })}>
            ← Back to Player
          </button>
        ) : (
          <button className="btn-text" onClick={() => navigate(`/tournament/${tournamentId}/matches`)}>
            ← Back to Matches
          </button>
        )}
      </div>

      <div className="match-detail-banner">
        {bannerUrl && (
          <img
            src={bannerUrl}
            alt=""
            className="match-detail-banner-img"
          />
        )}

        <div className="match-detail-overlay">
          <div className="match-detail-team">
            <TeamLogoLg name={series.team1_name} imageUrl={t1ImageUrl} />
            <span className={`match-detail-team-name ${finished && t1?.won ? 'winner' : ''}`}>
              {series.team1_name || 'TBD'}
            </span>
          </div>

          <div className="match-detail-center">
            {finished && t1 && t2 ? (
              <div className="match-detail-score">
                <span style={{ color: t1.won ? '#60e6b8' : '#ff6b81' }}>{t1.score}</span>
                <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '1.4rem' }}>–</span>
                <span style={{ color: t2.won ? '#60e6b8' : '#ff6b81' }}>{t2.score}</span>
              </div>
            ) : (
              <div className="match-detail-time">{time}</div>
            )}
            <div className="match-detail-meta">
              {finished ? date : dateOnly}
              {series.format && <div className="match-detail-format">{series.format}</div>}
            </div>
          </div>

          <div className="match-detail-team right">
            <TeamLogoLg name={series.team2_name} imageUrl={t2ImageUrl} />
            <span className={`match-detail-team-name ${finished && t2?.won ? 'winner' : ''}`}>
              {series.team2_name || 'TBD'}
            </span>
          </div>
        </div>
      </div>

      {finished && teams.length > 0 && (
        <div className="match-stats-grid">
          {teams.map(team => (
            <div key={team.name} className={`match-stats-team ${team.won ? 'winner-team' : ''}`}>
              <div className={`match-stats-team-header ${team.won ? 'winner' : ''}`}>
                {team.won ? '🏆 ' : ''}{team.name}
              </div>
              <table className="match-stats-table">
                <thead>
                  <tr>
                    <th>Player</th>
                    <th>K</th>
                    <th>D</th>
                    <th>A</th>
                    <th>Pts</th>
                    <th>TP</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {team.players.map(p => (
                    <tr key={p.player_id}>
                      <td style={{ fontWeight: 600 }}>{p.nickname}</td>
                      <td style={{ color: '#60e6b8' }}>{p.kills}</td>
                      <td style={{ color: '#ff6b81' }}>{p.deaths}</td>
                      <td style={{ color: '#facc15' }}>{p.assists}</td>
                      <td>{p.kda_points}</td>
                      <td className={p.team_points > 0 ? 'positive' : 'negative'}>
                        {p.team_points > 0 ? '+' : ''}{p.team_points}
                      </td>
                      <td className="stat-pts-total">{p.total_points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {!finished && (
        <div className="panel" style={{ marginTop: '1rem', textAlign: 'center' }}>
          <p className="muted">Stats will be available after the match is played.</p>
        </div>
      )}
    </div>
  );
}

export default MatchDetail;
