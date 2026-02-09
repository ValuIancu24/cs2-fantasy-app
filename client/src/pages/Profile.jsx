import React, { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../App.jsx';
import '../styles/profile.css';

function Profile() {
  const { apiBase, user, setUser } = useContext(AuthContext);
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [countryCode, setCountryCode] = useState(user?.country_code || '');
  const [profilePicture, setProfilePicture] = useState(null);
  const [currentPic, setCurrentPic] = useState(user?.profile_picture || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const token = localStorage.getItem('cs2_fantasy_token');

  useEffect(() => {
    const fetchProfile = async () => {
      const res = await fetch(`${apiBase}/auth/profile`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsername(data.username);
        setEmail(data.email);
        setCountryCode(data.country_code || '');
        setCurrentPic(data.profile_picture || '');
      }
    };
    fetchProfile();
  }, [apiBase, token]);

  const updateProfile = async e => {
    e.preventDefault();
    setMessage('');
    setError('');
    const res = await fetch(`${apiBase}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ username, email, country_code: countryCode.toUpperCase() || null })
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Failed to update profile');
    } else {
      const updated = { ...(user || {}), username, email, country_code: countryCode.toUpperCase() || null };
      setUser(updated);
      localStorage.setItem('cs2_fantasy_user', JSON.stringify(updated));
      setMessage('Profile updated');
    }
  };

  const uploadPicture = async e => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (!profilePicture) {
      setError('Select an image first');
      return;
    }
    const formData = new FormData();
    formData.append('profile_picture', profilePicture);

    const res = await fetch(`${apiBase}/auth/profile-picture`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Failed to upload picture');
    } else {
      setCurrentPic(data.profile_picture);
      const updated = { ...(user || {}), profile_picture: data.profile_picture };
      setUser(updated);
      localStorage.setItem('cs2_fantasy_user', JSON.stringify(updated));
      setMessage('Profile picture updated');
    }
  };

  const changePassword = async e => {
    e.preventDefault();
    setMessage('');
    setError('');
    const res = await fetch(`${apiBase}/auth/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.message || 'Failed to change password');
    } else {
      setMessage('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
    }
  };

  const countries = [
    { code: 'RO', name: 'Romania' },
    { code: 'US', name: 'United States' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'BR', name: 'Brazil' }
  ];

  return (
    <div className="profile-grid">
      <section className="panel">
        <h2>Profile</h2>
        <form onSubmit={updateProfile} className="profile-form">
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              minLength={3}
              maxLength={20}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>
          <label>
            Country
            <select
              value={countryCode}
              onChange={e => setCountryCode(e.target.value)}
            >
              <option value="">Select country</option>
              {countries.map(c => (
                <option key={c.code} value={c.code}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn-primary small">
            Save Profile
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Profile Picture</h2>
        <div className="profile-picture-preview">
          {currentPic ? (
            <div className="avatar">
              {/* Actual image will be served from public/uploads/profiles */}
            </div>
          ) : (
            <div className="avatar placeholder">?</div>
          )}
        </div>
        <form onSubmit={uploadPicture} className="profile-form">
          <input
            type="file"
            accept="image/*"
            onChange={e => setProfilePicture(e.target.files[0] || null)}
          />
          <button type="submit" className="btn-outlined small">
            Upload
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Change Password</h2>
        <form onSubmit={changePassword} className="profile-form">
          <label>
            Current Password
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            New Password
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              minLength={6}
              required
            />
          </label>
          <button type="submit" className="btn-outlined small">
            Change Password
          </button>
        </form>
        {error && <p className="error-text">{error}</p>}
        {message && <p className="success-text">{message}</p>}
      </section>
    </div>
  );
}

export default Profile;

