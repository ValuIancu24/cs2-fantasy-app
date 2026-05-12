import React, { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import '../styles/auth.css';

const SYMBOL_RE = /[!@#$%^&*()\-_+=\[\]{}|;:'",.<>?/\\`~]/;

function PasswordChecklist({ password }) {
  const rules = [
    { label: 'At least 6 characters', ok: password.length >= 6 },
    { label: 'At least one uppercase letter', ok: /[A-Z]/.test(password) },
    { label: 'At least one number', ok: /[0-9]/.test(password) },
    { label: 'At least one symbol (!@#$%...)', ok: SYMBOL_RE.test(password) },
  ];
  if (!password) return null;
  return (
    <ul className="password-checklist">
      {rules.map(r => (
        <li key={r.label} className={r.ok ? 'check-ok' : 'check-fail'}>
          {r.ok ? '✓' : '✗'} {r.label}
        </li>
      ))}
    </ul>
  );
}

function Register() {
  const { apiBase, setUser } = useContext(AuthContext);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const navigate = useNavigate();

  const passwordValid =
    password.length >= 6 &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    SYMBOL_RE.test(password);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!passwordValid) {
      setError('Password does not meet the requirements.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Registration failed');
      localStorage.setItem('cs2_fantasy_token', data.token);
      localStorage.setItem('cs2_fantasy_user', JSON.stringify(data.user));
      setUser(data.user);
      navigate('/my-fantasy', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h2>Create Account</h2>
      <form onSubmit={handleSubmit}>
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
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </label>
        <PasswordChecklist password={password} />
        <label>
          Confirm Password
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
          />
        </label>
        {confirmPassword && password !== confirmPassword && (
          <p className="check-fail" style={{ fontSize: '0.82rem', marginTop: '-0.25rem' }}>✗ Passwords do not match</p>
        )}
        {confirmPassword && password === confirmPassword && (
          <p className="check-ok" style={{ fontSize: '0.82rem', marginTop: '-0.25rem' }}>✓ Passwords match</p>
        )}
        {error && <div className="error-text">{error}</div>}
        {success && <div className="success-text">{success}</div>}
        <button type="submit" className="btn-primary full-width" disabled={loading}>
          {loading ? 'Creating account...' : 'Register'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <Link to="/login">Sign In</Link>
      </p>
    </div>
  );
}

export default Register;
