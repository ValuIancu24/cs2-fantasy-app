import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/home.css';

function Home() {
  return (
    <div className="home-hero">
      <div className="home-glow home-glow-1" />
      <div className="home-glow home-glow-2" />
      <div className="home-glow home-glow-3" />

      <div className="home-content">
        <div className="home-badge">CS2 FANTASY ESPORTS</div>
        <h1>
          Build Your<br />
          <span className="home-title-accent">Dream Team</span>
        </h1>
        <p>
          Pick 5 pros, join leagues with friends, and climb the leaderboard
          as the action unfolds live.
        </p>
        <div className="home-actions">
          <Link to="/register" className="btn-primary home-cta-primary">
            Get Started
          </Link>
          <Link to="/login" className="btn-outlined">
            Sign In
          </Link>
        </div>
      </div>

      <div className="home-preview">
        <div className="home-card home-card-leaderboard">
          <div className="home-card-label">Leaderboard</div>
          <div className="home-card-row">
            <span className="home-rank">🥇</span>
            <span className="home-card-user">device</span>
            <span className="home-pts">+147 pts</span>
          </div>
          <div className="home-card-row">
            <span className="home-rank">🥈</span>
            <span className="home-card-user">s1mple</span>
            <span className="home-pts">+132 pts</span>
          </div>
          <div className="home-card-row">
            <span className="home-rank">🥉</span>
            <span className="home-card-user">NiKo</span>
            <span className="home-pts">+118 pts</span>
          </div>
        </div>

        <div className="home-card home-card-team">
          <div className="home-card-label">My Team</div>
          <div className="home-card-players">
            {['s1mple', 'device', 'NiKo', 'sh1ro', 'ZywOo'].map(p => (
              <div key={p} className="home-player-chip">{p}</div>
            ))}
          </div>
          <div className="home-card-stat">
            <span className="home-card-pts-val">1,247</span>
            <span className="home-card-pts-label">total points</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;
