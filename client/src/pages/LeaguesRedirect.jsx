import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useContext } from 'react';
import { AuthContext } from '../App.jsx';

function LeaguesRedirect() {
  const { apiBase } = useContext(AuthContext);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${apiBase}/tournaments/active`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length === 1) {
          navigate(`/tournament/${data[0].id}/leagues`, { replace: true });
        } else {
          navigate('/my-fantasy', { replace: true });
        }
      })
      .catch(() => navigate('/my-fantasy', { replace: true }));
  }, []);

  return null;
}

export default LeaguesRedirect;
