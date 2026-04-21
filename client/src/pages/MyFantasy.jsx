import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';

import '../styles/myfantasy.css';
import '../styles/finished-tournaments.css';

function formatTournamentDates(startDate, endDate) {
  if (!startDate) return null;
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;

  const fmt = (d, opts) => d.toLocaleDateString('en-GB', opts);
  const startDay = start.getDate();
  const startMonth = fmt(start, { month: 'short' });
  const startYear = start.getFullYear();

  if (!end) return `${startDay} ${startMonth} ${startYear}`;

  const endDay = end.getDate();
  const endMonth = fmt(end, { month: 'short' });
  const endYear = end.getFullYear();

  if (startMonth === endMonth && startYear === endYear)
    return `${startDay}–${endDay} ${startMonth} ${startYear}`;
  if (startYear === endYear)
    return `${startDay} ${startMonth} – ${endDay} ${endMonth} ${startYear}`;
  return `${startDay} ${startMonth} ${startYear} – ${endDay} ${endMonth} ${endYear}`;
}

function MyFantasy() {
  const { apiBase, user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('cs2_fantasy_token');
    const url = isAdmin
      ? `${apiBase}/admin/tournaments`
      : `${apiBase}/tournaments/active`;
    const opts = isAdmin ? { headers: { Authorization: `Bearer ${token}` } } : {};

    fetch(url, opts)
      .then(r => r.json())
      .then(data => {
        const all = Array.isArray(data) ? data : [];
        setTournaments(isAdmin ? all.filter(t => t.status === 'active') : all);
      })
      .catch(() => setTournaments([]))
      .finally(() => setLoading(false));
  }, [apiBase, isAdmin]);

  return (
    <div className="myfantasy-page">
      <div className="myfantasy-bg-left" />
      <div className="myfantasy-bg-right" />
      <div className="myfantasy">
        <h1 className="myfantasy-title">Active Tournaments</h1>

        {loading && <p className="muted">Loading tournaments...</p>}

        {!loading && tournaments.length === 0 && (
          <div className="myfantasy-empty">
            <p>No active tournaments.</p>
          </div>
        )}

        <div className="tournament-cards">
          {tournaments.map(t => (
            <div
              key={t.id}
              className="tournament-card"
              onClick={() => navigate(`/tournament/${t.id}/leagues`)}
            >
              <div
                className="tournament-card-image"
                style={t.banner_url ? { backgroundImage: `url(${t.banner_url})` } : {}}
              >
                <div className="tournament-card-badge">CS2</div>
                <div className="ft-active-ribbon">Active</div>
                {isAdmin && t.is_visible === 0 && (
                  <div className="ft-active-ribbon" style={{ top: '2.2rem', background: 'rgba(251,191,36,0.85)', color: '#1a1000' }}>Hidden</div>
                )}
                <div className="tournament-card-name-overlay">{t.name}</div>
              </div>

              <div className="tournament-card-body">
                {t.name_short && t.name_short !== t.name && (
                  <p className="tournament-card-short">{t.name_short}</p>
                )}
                {formatTournamentDates(t.start_date, t.end_date) && (
                  <p className="muted tournament-card-meta">
                    {formatTournamentDates(t.start_date, t.end_date)}
                  </p>
                )}
                {isAdmin && (
                  <p className="muted tournament-card-meta">
                    ID: {t.id}
                    {t.last_synced && (
                      <> · Synced {new Date(t.last_synced.includes('T') ? t.last_synced : t.last_synced.replace(' ', 'T') + 'Z').toLocaleString('en-GB', { timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short' })}</>
                    )}
                  </p>
                )}
              </div>

              <div className="tournament-card-footer">
                <button
                  className="btn-primary small"
                  onClick={e => { e.stopPropagation(); navigate(`/tournament/${t.id}/leagues`); }}
                >
                  View Leagues →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default MyFantasy;
