import React, { useContext, useEffect, useRef, useState } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';
import { getData } from 'country-list';
import { FlagImg } from '../utils/flag.jsx';
import '../styles/profile.css';

const ALL_COUNTRIES = getData().sort((a, b) => a.name.localeCompare(b.name));

function CountrySelect({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  const selected = ALL_COUNTRIES.find(c => c.code === value);
  const filtered = search.trim()
    ? ALL_COUNTRIES.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : ALL_COUNTRIES;

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const select = (code) => { onChange(code); setOpen(false); setSearch(''); };

  return (
    <div className="country-select-wrapper" ref={ref}>
      <button type="button" className="country-select-trigger" onClick={() => setOpen(o => !o)}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {selected ? <><FlagImg code={selected.code} /> {selected.name}</> : 'Select country'}
        </span>
        <span className="country-select-arrow">▾</span>
      </button>
      {open && (
        <div className="country-select-dropdown">
          <input
            autoFocus
            type="text"
            placeholder="Search..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="country-select-search"
          />
          <div className="country-select-list">
            <div className="country-select-option" onClick={() => select('')}>— None —</div>
            {filtered.map(c => (
              <div
                key={c.code}
                className={`country-select-option ${c.code === value ? 'active' : ''}`}
                onClick={() => select(c.code)}
              >
                <FlagImg code={c.code} style={{ marginRight: 6 }} /> {c.name}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Profile() {
  const { apiBase, user, setUser } = useContext(AuthContext);
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [countryCode, setCountryCode] = useState(user?.country_code || '');
  const [profilePicture, setProfilePicture] = useState(null);
  const [currentPic, setCurrentPic] = useState(user?.profile_picture || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
      body: JSON.stringify({ email, country_code: countryCode.toUpperCase() || null })
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

  const SYMBOL_RE = /[!@#$%^&*()\-_+=\[\]{}|;:'",.<>?/\\`~]/;
  const newPasswordValid =
    newPassword.length >= 6 &&
    /[A-Z]/.test(newPassword) &&
    /[0-9]/.test(newPassword) &&
    SYMBOL_RE.test(newPassword);

  const changePassword = async e => {
    e.preventDefault();
    setMessage('');
    setError('');
    if (!newPasswordValid) {
      setError('New password does not meet the requirements.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from the current password.');
      return;
    }
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
      setConfirmPassword('');
    }
  };


  return (
    <div className="profile-grid">
      <section className="panel">
        <h2>Profile</h2>
        <form onSubmit={updateProfile} className="profile-form">
          <label>
            Username
            <input type="text" value={username} disabled title="Username cannot be changed" style={{ opacity: 0.5, cursor: 'not-allowed' }} />
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
            <CountrySelect value={countryCode} onChange={setCountryCode} />
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
            <img className="avatar" src={currentPic} alt="Profile" />
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
              required
            />
          </label>
          {newPassword && (
            <ul className="password-checklist">
              {[
                { label: 'At least 6 characters', ok: newPassword.length >= 6 },
                { label: 'At least one uppercase letter', ok: /[A-Z]/.test(newPassword) },
                { label: 'At least one number', ok: /[0-9]/.test(newPassword) },
                { label: 'At least one symbol (!@#$%...)', ok: SYMBOL_RE.test(newPassword) },
              ].map(r => (
                <li key={r.label} className={r.ok ? 'check-ok' : 'check-fail'}>
                  {r.ok ? '✓' : '✗'} {r.label}
                </li>
              ))}
            </ul>
          )}
          <label>
            Confirm New Password
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </label>
          {confirmPassword && newPassword !== confirmPassword && (
            <p className="check-fail" style={{ fontSize: '0.82rem', marginTop: '-0.25rem' }}>✗ Passwords do not match</p>
          )}
          {confirmPassword && newPassword === confirmPassword && (
            <p className="check-ok" style={{ fontSize: '0.82rem', marginTop: '-0.25rem' }}>✓ Passwords match</p>
          )}
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

