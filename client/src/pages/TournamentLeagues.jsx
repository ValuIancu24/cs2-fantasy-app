import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { FlagImg } from '../utils/flag.jsx';
import '../styles/tournament-leagues.css';
import '../styles/finished-tournaments.css';

function TournamentLeagues() {
  const { tournamentId } = useParams();
  const { apiBase, user } = useContext(AuthContext);
  const isAdmin = user?.role === 'admin';
  const navigate = useNavigate();
  const token = localStorage.getItem('cs2_fantasy_token');

  const [leagues, setLeagues] = useState([]);
  const [tournamentName, setTournamentName] = useState('');
  const [tournamentBanner, setTournamentBanner] = useState('');
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [createName, setCreateName] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createMessage, setCreateMessage] = useState('');
  const [newInviteCode, setNewInviteCode] = useState('');

  // Join modal state
  const [joinModal, setJoinModal] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Admin edit state
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  // Search
  const [leagueSearch, setLeagueSearch] = useState('');

  const fetchLeagues = () => {
    setLoading(true);
    fetch(`${apiBase}/tournaments/${tournamentId}/leagues`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setLeagues(data);
          if (data.length > 0) setTournamentName('');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Also fetch tournament info (name, banner, status)
    fetch(`${apiBase}/tournaments/${tournamentId}/info`)
      .then(r => r.ok ? r.json() : null)
      .then(t => {
        if (t?.name) {
          setTournamentName(t.name);
          setTournamentBanner(t.banner_url || '');
          setIsReadOnly(t.status === 'historical');
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchLeagues();
  }, [tournamentId]);

  const handleCreate = async e => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true);
    setCreateMessage('');
    setNewInviteCode('');

    const res = await fetch(`${apiBase}/leagues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: createName.trim(), tournamentId: parseInt(tournamentId), isPublic })
    });
    const data = await res.json();
    setCreating(false);

    if (!res.ok) {
      setCreateMessage(data.message || 'Failed to create league');
      return;
    }

    setCreateName('');
    setIsPublic(true);
    if (data.invite_code) {
      setNewInviteCode(data.invite_code);
      setCreateMessage('Private league created! Share the invite code below.');
    } else {
      setCreateMessage('League created successfully!');
    }
    fetchLeagues();
  };

  const handleJoinPublic = async leagueId => {
    setJoining(true);
    const res = await fetch(`${apiBase}/leagues/${leagueId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({})
    });
    const data = await res.json();
    setJoining(false);

    if (!res.ok) {
      alert(data.message || 'Failed to join');
      return;
    }
    navigate(`/team-builder/${leagueId}`);
  };

  const handleJoinPrivate = async () => {
    if (!joinModal) return;
    setJoinError('');
    if (joinCode.length !== 6) {
      setJoinError('Invite code must be 6 characters');
      return;
    }
    setJoining(true);
    const res = await fetch(`${apiBase}/leagues/${joinModal.leagueId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ inviteCode: joinCode.toUpperCase() })
    });
    const data = await res.json();
    setJoining(false);

    if (!res.ok) {
      setJoinError(data.message || 'Failed to join');
      return;
    }
    setJoinModal(null);
    setJoinCode('');
    navigate(`/team-builder/${joinModal.leagueId}`);
  };

  const handleRename = async (leagueId) => {
    if (!editName.trim()) return;
    const res = await fetch(`${apiBase}/leagues/${leagueId}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: editName.trim() })
    });
    if (res.ok) { setEditingId(null); fetchLeagues(); }
    else { const d = await res.json(); alert(d.message || 'Failed to rename'); }
  };

  const handleDelete = async (leagueId, leagueName) => {
    if (!window.confirm(`Ștergi liga "${leagueName}"? Toate echipele din ea vor fi șterse.`)) return;
    const res = await fetch(`${apiBase}/leagues/${leagueId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) fetchLeagues();
    else { const d = await res.json(); alert(d.message || 'Failed to delete'); }
  };

  const searchLower = leagueSearch.toLowerCase();
  const publicLeagues = leagues.filter(l => l.is_public === 1 && l.name.toLowerCase().includes(searchLower));
  const privateLeagues = leagues.filter(l => l.is_public === 0 && l.name.toLowerCase().includes(searchLower));

  return (
    <div className="tl-page">
      <div
        className={`tl-banner ${tournamentBanner ? 'tl-banner--has-image' : ''}`}
        style={tournamentBanner ? { backgroundImage: `url(${tournamentBanner})` } : {}}
      >
        <div className="tl-banner-content">
          <button className="btn-text tl-back" onClick={() => navigate(isReadOnly ? '/finished-tournaments' : '/my-fantasy')}>
            ← Back to Tournaments
          </button>
          <h1 className="tl-banner-title">
            {tournamentName || `Tournament #${tournamentId}`}
            {isReadOnly && <span className="tl-finished-badge">Finished</span>}
          </h1>
          <p className="tl-banner-sub">
            {leagues.length} {leagues.length === 1 ? 'league' : 'leagues'}
          </p>
        </div>
      </div>

      <div className="tl-layout" style={{ marginTop: '1.5rem' }}>
        {/* LEFT: League list */}
        <div className="tl-list-section">
          {leagues.length > 0 && (
            <div className="tl-search-wrap">
              <input
                type="text"
                placeholder="Search leagues..."
                value={leagueSearch}
                onChange={e => setLeagueSearch(e.target.value)}
                className="tl-search-input"
              />
              {leagueSearch && (
                <button className="tl-search-clear" onClick={() => setLeagueSearch('')}>×</button>
              )}
            </div>
          )}

          {loading && <p className="muted">Loading leagues...</p>}

          {!loading && leagues.length === 0 && (
            <p className="muted">No leagues yet. Be the first to create one!</p>
          )}

          {!loading && leagues.length > 0 && publicLeagues.length === 0 && privateLeagues.length === 0 && (
            <p className="muted">No leagues match "{leagueSearch}".</p>
          )}

          {publicLeagues.length > 0 && (
            <>
              <h2 className="tl-section-title">Public Leagues</h2>
              <div className="tl-league-list">
                {publicLeagues.map(l => (
                  <div key={l.id} className="tl-league-card">
                    <div className="tl-league-info">
                      {editingId === l.id ? (
                        <div className="tl-edit-row">
                          <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename(l.id)} autoFocus />
                          <button className="btn-tiny" onClick={() => handleRename(l.id)}>Save</button>
                          <button className="btn-tiny btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div className="tl-league-name-row">
                          <span className="tl-league-name">{l.name}</span>
                          {l.is_member ? <span className="tl-joined-badge">✓ Joined</span> : null}
                        </div>
                      )}
                      <div className="tl-league-meta">
                        <span className="tl-member-count">
                          <span className="tl-member-icon">👥</span>
                          {l.member_count} member{l.member_count !== 1 ? 's' : ''}
                        </span>
                        <span className="tl-created-by">
                          created by
                          <span className="tl-creator-chip">
                            {l.creator_picture
                              ? <img src={l.creator_picture} alt="" className="tl-creator-avatar" />
                              : <span className="tl-creator-avatar tl-creator-placeholder">{l.creator_name?.[0]?.toUpperCase()}</span>
                            }
                            <FlagImg code={l.creator_country} style={{ width: 14 }} />
                            <span>{l.creator_name}</span>
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="tl-card-actions">
                      {isAdmin && (
                        <>
                          <button className="btn-tiny btn-ghost" onClick={() => { setEditingId(l.id); setEditName(l.name); }}>Edit</button>
                          <button className="btn-tiny btn-danger-sm" onClick={() => handleDelete(l.id, l.name)}>Delete</button>
                        </>
                      )}
                      {l.is_member && (
                        <button className="btn-outlined small" onClick={() => navigate(`/tournament/${tournamentId}/leaderboard?league=${l.id}`)}>View Leaderboard</button>
                      )}
                      {l.is_member ? (
                        <button className="btn-outlined small" onClick={() => navigate(`/tournament/${tournamentId}/my-team?league=${l.id}`)}>View Team</button>
                      ) : !isReadOnly ? (
                        <button className="btn-primary small" onClick={() => handleJoinPublic(l.id)} disabled={joining}>Join</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {privateLeagues.length > 0 && (
            <>
              <h2 className="tl-section-title">Private Leagues</h2>
              <div className="tl-league-list">
                {privateLeagues.map(l => (
                  <div key={l.id} className="tl-league-card">
                    <div className="tl-league-info">
                      {editingId === l.id ? (
                        <div className="tl-edit-row">
                          <input value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRename(l.id)} autoFocus />
                          <button className="btn-tiny" onClick={() => handleRename(l.id)}>Save</button>
                          <button className="btn-tiny btn-ghost" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div className="tl-league-name-row">
                          <span className="tl-league-name">{l.name}</span>
                          {l.is_member ? <span className="tl-joined-badge">✓ Joined</span> : null}
                        </div>
                      )}
                      <div className="tl-league-meta">
                        <span className="tl-member-count">
                          <span className="tl-member-icon">👥</span>
                          {l.member_count} member{l.member_count !== 1 ? 's' : ''}
                          <span className="tl-private-badge">🔒 Private</span>
                        </span>
                        <span className="tl-created-by">
                          created by
                          <span className="tl-creator-chip">
                            {l.creator_picture
                              ? <img src={l.creator_picture} alt="" className="tl-creator-avatar" />
                              : <span className="tl-creator-avatar tl-creator-placeholder">{l.creator_name?.[0]?.toUpperCase()}</span>
                            }
                            <FlagImg code={l.creator_country} style={{ width: 14 }} />
                            <span>{l.creator_name}</span>
                          </span>
                        </span>
                        {(isAdmin || l.is_member) && l.invite_code && (
                          <span className="tl-invite-inline">
                            <span className="tl-invite-inline-label">Code:</span>
                            <span className="tl-invite-inline-code">{l.invite_code}</span>
                            <button
                              className="tl-invite-copy"
                              onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(l.invite_code); }}
                              title="Copy"
                            >
                              Copy
                            </button>
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="tl-card-actions">
                      {isAdmin && (
                        <>
                          <button className="btn-tiny btn-ghost" onClick={() => { setEditingId(l.id); setEditName(l.name); }}>Edit</button>
                          <button className="btn-tiny btn-danger-sm" onClick={() => handleDelete(l.id, l.name)}>Delete</button>
                        </>
                      )}
                      {l.is_member && (
                        <button className="btn-outlined small" onClick={() => navigate(`/tournament/${tournamentId}/leaderboard?league=${l.id}`)}>View Leaderboard</button>
                      )}
                      {l.is_member ? (
                        <button className="btn-outlined small" onClick={() => navigate(`/tournament/${tournamentId}/my-team?league=${l.id}`)}>View Team</button>
                      ) : !isReadOnly ? (
                        <button className="btn-outlined small" onClick={() => { setJoinModal({ leagueId: l.id, leagueName: l.name }); setJoinCode(''); setJoinError(''); }}>Join with Code</button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* RIGHT: Create league form — hidden for finished tournaments */}
        <div className="tl-create-section panel" style={isReadOnly ? { display: 'none' } : {}}>
          <h2>Create New League</h2>
          <form onSubmit={handleCreate} className="tl-create-form">
            <label>
              League Name
              <input
                type="text"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                placeholder="My League"
                maxLength={40}
                required
              />
            </label>

            <div className="tl-toggle-row">
              <span>Visibility</span>
              <div className="tl-toggle">
                <button
                  type="button"
                  className={isPublic ? 'active' : ''}
                  onClick={() => setIsPublic(true)}
                >
                  Public
                </button>
                <button
                  type="button"
                  className={!isPublic ? 'active' : ''}
                  onClick={() => setIsPublic(false)}
                >
                  Private
                </button>
              </div>
            </div>

            {!isPublic && (
              <p className="muted" style={{ fontSize: '0.8rem', margin: '0' }}>
                An invite code will be generated automatically.
              </p>
            )}

            <button type="submit" className="btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create League'}
            </button>
          </form>

          {createMessage && (
            <p className={createMessage.includes('successfully') || createMessage.includes('created') ? 'success-text' : 'error-text'}>
              {createMessage}
            </p>
          )}

          {newInviteCode && (
            <div className="tl-invite-box">
              <span className="muted" style={{ fontSize: '0.8rem' }}>Invite Code</span>
              <span className="tl-invite-code">{newInviteCode}</span>
              <button
                className="btn-text small"
                onClick={() => navigator.clipboard.writeText(newInviteCode)}
              >
                Copy
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Join with code modal */}
      {joinModal && (
        <div className="tl-modal-backdrop" onClick={() => setJoinModal(null)}>
          <div className="tl-modal" onClick={e => e.stopPropagation()}>
            <h3>Join "{joinModal.leagueName}"</h3>
            <label>
              Invite Code
              <input
                type="text"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                placeholder="XXXXXX"
                autoFocus
              />
            </label>
            {joinError && <p className="error-text">{joinError}</p>}
            <div className="tl-modal-actions">
              <button className="btn-outlined small" onClick={() => setJoinModal(null)}>
                Cancel
              </button>
              <button className="btn-primary small" onClick={handleJoinPrivate} disabled={joining}>
                {joining ? 'Joining...' : 'Join'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TournamentLeagues;
