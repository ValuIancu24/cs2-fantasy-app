import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import '../styles/matches.css';

function formatMatchDate(iso) {
  if (!iso) return { time: '—', date: '—' };
  const d = new Date(iso);
  return {
    time: d.toLocaleTimeString('en-GB', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }),
    date: d.toLocaleDateString('en-GB', { timeZone: 'Europe/Bucharest', day: '2-digit', month: 'short' })
  };
}

function TeamLogo({ name, imageUrl }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="team-logo">
      {imageUrl
        ? <img src={imageUrl} alt={name} />
        : initials}
    </div>
  );
}

function MatchCard({ match, onClick, finished }) {
  const { time, date } = formatMatchDate(match.scheduled_at);
  const t1Won = finished && match.team1_score > match.team2_score;
  const t2Won = finished && match.team2_score > match.team1_score;
  const ongoing = !finished && match.ongoing;

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      className={`match-card${ongoing ? ' ongoing' : ''}`}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="match-card-time">
        <span className="time">{time}</span>
        <span className="date">{date}</span>
        {match.format && <span className="format">{match.format}</span>}
      </div>

      <div className="match-card-teams">
        <div className="match-team-row">
          <TeamLogo name={match.team1_name} imageUrl={match.team1_image_url} />
          <span className={`match-team-name ${t1Won ? 'winner' : ''}`}>{match.team1_name || 'TBD'}</span>
        </div>
        <div className="match-team-row">
          <TeamLogo name={match.team2_name} imageUrl={match.team2_image_url} />
          <span className={`match-team-name ${t2Won ? 'winner' : ''}`}>{match.team2_name || 'TBD'}</span>
        </div>
      </div>

      {finished ? (
        <div className="match-card-score">
          <span className={`score-value ${t1Won ? 'win' : 'loss'}`}>{match.team1_score}</span>
          <span className={`score-value ${t2Won ? 'win' : 'loss'}`}>{match.team2_score}</span>
        </div>
      ) : ongoing ? (
        <span className="match-ongoing-badge">Ongoing</span>
      ) : null}
    </div>
  );
}

function Matches() {
  const { tournamentId } = useParams();
  const { apiBase } = useContext(AuthContext);
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/matches/tournament/${tournamentId}`)
      .then(r => r.json())
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase, tournamentId]);

  if (loading) return <p className="muted" style={{ padding: '1rem' }}>Loading matches...</p>;
  if (!data) return <p className="muted" style={{ padding: '1rem' }}>Could not load matches.</p>;

  const { tournament, upcoming, results } = data;
  const goToMatch = seriesId => navigate(`/tournament/${tournamentId}/matches/${seriesId}`);

  const ongoingMatches = upcoming.filter(m => m.ongoing);
  const notStartedMatches = upcoming.filter(m => !m.ongoing);

  return (
    <div className="matches-page">
      <div className="matches-header">
        {tournament.banner_url && (
          <img src={tournament.banner_url} alt="" className="matches-header-banner" />
        )}
        <div className="matches-header-info">
          <h1>{tournament.name}</h1>
          <span className="match-badge fantasy">Fantasy</span>
        </div>
      </div>

      {ongoingMatches.length > 0 && (
        <>
          <div className="matches-section-title">Ongoing</div>
          {ongoingMatches.map(m => (
            <MatchCard key={m.id} match={m} finished={false} onClick={() => goToMatch(m.id)} />
          ))}
        </>
      )}

      {notStartedMatches.length > 0 && (
        <>
          <div className="matches-section-title">Upcoming</div>
          {notStartedMatches.map(m => (
            <MatchCard key={m.id} match={m} finished={false} onClick={() => goToMatch(m.id)} />
          ))}
        </>
      )}

      {results.length > 0 && (
        <>
          <div className="matches-section-title">Results</div>
          {results.map(m => (
            <MatchCard key={m.id} match={m} finished={true} onClick={() => goToMatch(m.id)} />
          ))}
        </>
      )}

      {upcoming.length === 0 && results.length === 0 && (
        <p className="muted">No matches available yet for this tournament.</p>
      )}
    </div>
  );
}

export default Matches;
