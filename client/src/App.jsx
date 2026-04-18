import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useMatch, Link } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import MyFantasy from './pages/MyFantasy.jsx';
import LeaguesRedirect from './pages/LeaguesRedirect.jsx';
import TournamentLeagues from './pages/TournamentLeagues.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TeamBuilder from './pages/TeamBuilder.jsx';
import MyTeam from './pages/MyTeam.jsx';
import Matches from './pages/Matches.jsx';
import MatchDetail from './pages/MatchDetail.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import FinishedTournaments from './pages/FinishedTournaments.jsx';
import Profile from './pages/Profile.jsx';
import { FlagImg } from './utils/flag.jsx';
import { AuthContext } from './context/AuthContext.jsx';
import './styles/app.css';

const API_BASE = 'http://localhost:5000/api';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = React.useContext(AuthContext);
  const location = useLocation();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/my-fantasy" replace />;
  }

  return children;
}

function NavLinks({ user }) {
  const tournamentMatch = useMatch('/tournament/:tournamentId/*');
  const tournamentId = tournamentMatch?.params?.tournamentId;

  return (
    <nav className="nav-links">
      {user && (
        <>
          <Link to="/my-fantasy">My Fantasy</Link>
          <Link to="/finished-tournaments">Ended Tournaments</Link>
          {tournamentId && (
            <>
              <Link to={`/tournament/${tournamentId}/leagues`}>Leagues</Link>
              <Link to={`/tournament/${tournamentId}/matches`}>Matches</Link>
              <Link to={`/tournament/${tournamentId}/my-team`}>My Team</Link>
              <Link to={`/tournament/${tournamentId}/leaderboard`}>Leaderboard</Link>
            </>
          )}
          {user.role === 'admin' && <Link to="/admin">Admin</Link>}
        </>
      )}
    </nav>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('cs2_fantasy_user');
    const token = localStorage.getItem('cs2_fantasy_token');

    if (stored && token) {
      fetch(`${API_BASE}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => {
          if (!r.ok) throw new Error('Token invalid');
          return r.json();
        })
        .then(freshUser => {
          const merged = { ...JSON.parse(stored), ...freshUser };
          localStorage.setItem('cs2_fantasy_user', JSON.stringify(merged));
          setUser(merged);
        })
        .catch(() => {
          localStorage.removeItem('cs2_fantasy_token');
          localStorage.removeItem('cs2_fantasy_user');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      localStorage.removeItem('cs2_fantasy_token');
      localStorage.removeItem('cs2_fantasy_user');
      setLoading(false);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('cs2_fantasy_token');
    localStorage.removeItem('cs2_fantasy_user');
    setUser(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, apiBase: API_BASE }}>
      <div className="app-root">
        <header className="app-header">
          {user
            ? <span className="logo">CS2 Fantasy</span>
            : <Link to="/" className="logo">CS2 Fantasy</Link>
          }
          <NavLinks user={user} />
          <div className="auth-section">
            {user ? (
              <>
                <Link to="/profile" className="user-pill">
                  {user.profile_picture
                    ? <img src={user.profile_picture} alt="avatar" className="user-pill-avatar" />
                    : <div className="user-pill-avatar user-pill-avatar-placeholder">{user.username[0].toUpperCase()}</div>
                  }
                  <FlagImg code={user.country_code} />
                  <span>{user.username}</span>
                </Link>
                <button className="btn-outlined" onClick={handleLogout}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-text">
                  Sign In
                </Link>
                <Link to="/register" className="btn-primary">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </header>

        <main className="app-main">
          <Routes>
            <Route path="/" element={loading ? null : user ? <Navigate to="/my-fantasy" replace /> : <Home />} />
            <Route path="/login" element={loading ? null : user ? <Navigate to="/my-fantasy" replace /> : <Login />} />
            <Route path="/register" element={loading ? null : user ? <Navigate to="/my-fantasy" replace /> : <Register />} />
            <Route path="/dashboard" element={<Navigate to="/my-fantasy" replace />} />
            <Route path="/leagues" element={<ProtectedRoute><LeaguesRedirect /></ProtectedRoute>} />
            <Route path="/finished-tournaments" element={<ProtectedRoute><FinishedTournaments /></ProtectedRoute>} />
            <Route
              path="/my-fantasy"
              element={
                <ProtectedRoute>
                  <MyFantasy />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tournament/:tournamentId/leagues"
              element={
                <ProtectedRoute>
                  <TournamentLeagues />
                </ProtectedRoute>
              }
            />
            <Route
              path="/team-builder/:leagueId"
              element={
                <ProtectedRoute>
                  <TeamBuilder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tournament/:tournamentId/matches/:seriesId"
              element={
                <ProtectedRoute>
                  <MatchDetail />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tournament/:tournamentId/matches"
              element={
                <ProtectedRoute>
                  <Matches />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tournament/:tournamentId/my-team"
              element={
                <ProtectedRoute>
                  <MyTeam />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tournament/:tournamentId/leaderboard"
              element={
                <ProtectedRoute>
                  <Leaderboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute adminOnly>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </AuthContext.Provider>
  );
}

export default App;
