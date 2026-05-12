const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

const SYMBOL_RE = /[!@#$%^&*()\-_+=\[\]{}|;:'",.<>?/\\`~]/;
function validatePassword(password) {
  if (!password || password.length < 6) return 'Password must be at least 6 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain at least one number';
  if (!SYMBOL_RE.test(password)) return 'Password must contain at least one symbol (!@#$%^&*...)';
  return null;
}

const uploadsDir = path.join(__dirname, '..', '..', 'client', 'public', 'uploads', 'profiles');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${Date.now()}${ext.toLowerCase()}`);
  }
});

const upload = multer({ storage });

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
}

// REGISTER
router.post('/register', (req, res) => {
  const { username, email, password } = req.body;

  if (!username || username.length < 3 || username.length > 20) {
    return res.status(400).json({ message: 'Username must be 3-20 characters' });
  }
  if (!email || !validateEmail(email)) {
    return res.status(400).json({ message: 'Invalid email' });
  }
  const pwErr = validatePassword(password);
  if (pwErr) return res.status(400).json({ message: pwErr });

  db.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email], (err, row) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (row) return res.status(400).json({ message: 'Username or email already in use' });

    const hash = bcrypt.hashSync(password, 10);
    db.run(
      'INSERT INTO users (username, email, password, role) VALUES (?, ?, ?, ?)',
      [username, email, hash, 'user'],
      function(err) {
        if (err) return res.status(500).json({ message: 'Registration failed' });
        const newUser = {
          id: this.lastID,
          username,
          email,
          role: 'user',
          country_code: null,
          profile_picture: null
        };
        const token = generateToken(newUser);
        res.status(201).json({ message: 'Registration successful', token, user: newUser });
      }
    );
  });
});

// LOGIN
router.post('/login', (req, res) => {
  const { usernameOrEmail, password } = req.body;

  if (!usernameOrEmail || !password) {
    return res.status(400).json({ message: 'Username/email and password required' });
  }

  db.get('SELECT * FROM users WHERE username = ? OR email = ?', [usernameOrEmail, usernameOrEmail], (err, user) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const valid = bcrypt.compareSync(password, user.password);
    if (!valid) return res.status(400).json({ message: 'Invalid credentials' });

    const token = generateToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        country_code: user.country_code,
        profile_picture: user.profile_picture
      }
    });
  });
});

// GET PROFILE
router.get('/profile', authMiddleware, (req, res) => {
  db.get('SELECT id, username, email, role, country_code, profile_picture, created_at FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  });
});

// UPDATE PROFILE
router.put('/profile', authMiddleware, (req, res) => {
  const { email, country_code } = req.body;

  if (email && !validateEmail(email)) {
    return res.status(400).json({ message: 'Invalid email' });
  }

  db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, current) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!current) return res.status(404).json({ message: 'User not found' });

    const newEmail = email || current.email;
    const newCountry = country_code || current.country_code;

    db.run('UPDATE users SET email = ?, country_code = ? WHERE id = ?',
      [newEmail, newCountry, req.user.id],
      (err) => {
        if (err) return res.status(500).json({ message: 'Update failed' });
        res.json({ message: 'Profile updated' });
      }
    );
  });
});

// CHANGE PASSWORD
router.put('/password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Both passwords required' });
  }
  const pwErr = validatePassword(newPassword);
  if (pwErr) return res.status(400).json({ message: pwErr });

  db.get('SELECT * FROM users WHERE id = ?', [req.user.id], (err, user) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const valid = bcrypt.compareSync(currentPassword, user.password);
    if (!valid) return res.status(400).json({ message: 'Current password incorrect' });

    const hash = bcrypt.hashSync(newPassword, 10);
    db.run('UPDATE users SET password = ? WHERE id = ?', [hash, req.user.id], (err) => {
      if (err) return res.status(500).json({ message: 'Update failed' });
      res.json({ message: 'Password changed' });
    });
  });
});

// UPLOAD PROFILE PICTURE
router.post('/profile-picture', authMiddleware, upload.single('profile_picture'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const relativePath = `/uploads/profiles/${req.file.filename}`;
  db.run('UPDATE users SET profile_picture = ? WHERE id = ?', [relativePath, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Update failed' });
    res.json({ message: 'Profile picture updated', profile_picture: relativePath });
  });
});

module.exports = router;