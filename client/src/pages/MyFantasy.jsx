import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../App.jsx';

import '../styles/myfantasy.css';

function MyFantasy() {
  const { apiBase, user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${apiBase}/tournaments/active`)
      .then(r => r.json())
      .then(data => setTournaments(Array.isArray(data) ? data : []))
      .catch(() => setTournaments([]))
      .finally(() => setLoading(false));
  }, [apiBase]);

  return (
    <div className="myfantasy">
      <h1 className="myfantasy-title">Active Tournaments</h1>

      {loading && <p className="muted">Loading tournaments...</p>}

      {!loading && tournaments.length === 0 && (
        <div className="myfantasy-empty">
          <p>No active tournaments.</p>
          <p className="muted">An admin needs to sync a tournament from the Admin panel first.</p>
        </div>
      )}

      <div className="tournament-cards">
        {tournaments.map(t => (
          <div key={t.id} className="tournament-card">
            <div className="tournament-card-badge">CS2</div>
            <div className="tournament-card-body">
              <h2>{t.name}</h2>
              {t.name_short && t.name_short !== t.name && (
                <p className="tournament-card-short">{t.name_short}</p>
              )}
              {isAdmin && (
                <p className="muted tournament-card-meta">
                  ID: {t.id}
                  {t.last_synced && (
                    <> · Synced {new Date(t.last_synced).toLocaleDateString('ro-RO')}</>
                  )}
                </p>
              )}
            </div>
            <button
              className="btn-primary"
              onClick={() => navigate(`/tournament/${t.id}/leagues`)}
            >
              View Leagues
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default MyFantasy;
