import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Dashboard from './pages/Dashboard.jsx';
import TeamBuilder from './pages/TeamBuilder.jsx';
import MyTeam from './pages/MyTeam.jsx';
import Leaderboard from './pages/Leaderboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import Profile from './pages/Profile.jsx';
import './styles/app.css';

const API_BASE = 'http://localhost:5000/api';

export const AuthContext = React.createContext(null);

function ProtectedRoute({ children, adminOnly = false }) {
  const { user } = React.useContext(AuthContext);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (adminOnly && user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return children;
}

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('cs2_fantasy_user');
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch {
        localStorage.removeItem('cs2_fantasy_user');
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('cs2_fantasy_token');
    localStorage.removeItem('cs2_fantasy_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, apiBase: API_BASE }}>
      <div className="app-root">
        <header className="app-header">
          <Link to="/" className="logo">
            CS2 Fantasy
          </Link>
          <nav className="nav-links">
            <Link to="/dashboard">Leagues</Link>
            <Link to="/my-team">My Team</Link>
            <Link to="/leaderboard">Leaderboard</Link>
            {user && user.role === 'admin' && <Link to="/admin">Admin</Link>}
          </nav>
          <div className="auth-section">
            {user ? (
              <>
                <Link to="/profile" className="user-pill">
                  <span className="flag">{user.country_code ? String.fromCodePoint(...user.country_code.split('').map(c => 127397 + c.charCodeAt(0))) : '🌐'}</span>
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
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
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
              path="/my-team"
              element={
                <ProtectedRoute>
                  <MyTeam />
                </ProtectedRoute>
              }
            />
            <Route
              path="/leaderboard"
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

