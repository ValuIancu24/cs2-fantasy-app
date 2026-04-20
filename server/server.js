require('dotenv').config({ path: '../.env' });

const express = require('express');
const cors = require('cors');
const path = require('path');

// Ensure DB is initialized
require('./database');

const { startAutoSync } = require('./services/autoSync');
startAutoSync();

const authRoutes = require('./routes/auth');
const leagueRoutes = require('./routes/leagues');
const playerRoutes = require('./routes/players');
const fantasyTeamRoutes = require('./routes/fantasyTeams');
const adminRoutes = require('./routes/admin');
const tournamentRoutes = require('./routes/tournaments');
const matchRoutes = require('./routes/matches');

const app = express();

const CLIENT_ORIGIN = 'http://localhost:5173';

app.use(
  cors({
    origin: CLIENT_ORIGIN
  })
);

app.use(express.json());

// Static serving for uploaded images
const uploadsPath = path.join(__dirname, '..', 'client', 'public', 'uploads', 'profiles');
app.use('/uploads/profiles', express.static(uploadsPath));
const bannersPath = path.join(__dirname, '..', 'client', 'public', 'uploads', 'banners');
app.use('/uploads/banners', express.static(bannersPath));
const matchesPath = path.join(__dirname, '..', 'client', 'public', 'uploads', 'matches');
app.use('/uploads/matches', express.static(matchesPath));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/leagues', leagueRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/fantasy-teams', fantasyTeamRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/matches', matchRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

