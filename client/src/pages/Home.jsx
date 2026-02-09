import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/home.css';

function Home() {
  return (
    <div className="home-hero">
      <div className="home-overlay home-player-1">{/* player1.png placeholder */}</div>
      <div className="home-overlay home-player-2">{/* player2.png placeholder */}</div>
      <div className="home-overlay home-player-3">{/* player3.png placeholder */}</div>

      <div className="home-content">
        <h1>CS2 Fantasy Esports</h1>
        <p>
          Build your dream team, join leagues with friends, and climb the leaderboard as the
         action unfolds.
        </p>
        <div className="home-actions">
          <Link to="/register" className="btn-primary">
            Get Started
          </Link>
          <Link to="/login" className="btn-outlined">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export default Home;

