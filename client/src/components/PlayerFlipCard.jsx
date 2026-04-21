import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function formatPrice(price) {
  return `${Math.round((price ?? 190000) / 1000)}K`;
}

function PlayerFlipCard({ player, tournamentId, isSelected = false, disabled = false, navigateState = null, showPhoto = false, children }) {
  const [flipped, setFlipped] = useState(false);
  const navigate = useNavigate();

  const hasPhoto = showPhoto && !!player.player_image_url;

  return (
    <div className={`flip-card-wrapper${disabled ? ' disabled' : ''}`}>
      <div
        className={`flip-card${hasPhoto ? ' flip-card-photo' : ''}`}
        onClick={() => setFlipped(f => !f)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setFlipped(f => !f)}
      >
        <div className={`flip-card-inner${flipped ? ' flipped' : ''}`}>
          {hasPhoto ? (
            <div className={`flip-card-front flip-card-front-photo${isSelected ? ' selected' : ''}`}>
              <img src={player.player_image_url} alt={player.nickname} className="player-photo" />
              <div className="player-photo-info">
                <span className="player-photo-name">{player.nickname}</span>
                <span className="player-photo-price">{formatPrice(player.price)}</span>
              </div>
            </div>
          ) : (
            <div className={`flip-card-front${isSelected ? ' selected' : ''}`}>
              <div className="name-row"><span>{player.nickname}</span></div>
              <div className="player-price">{formatPrice(player.price)}</div>
            </div>
          )}
          <div className="flip-card-back">
            <button
              className="btn-outlined small"
              type="button"
              onClick={e => {
                e.stopPropagation();
                if (tournamentId) navigate(`/tournament/${tournamentId}/players/${player.id}`, navigateState ? { state: navigateState } : undefined);
              }}
            >
              Player Profile
            </button>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}

export default PlayerFlipCard;
