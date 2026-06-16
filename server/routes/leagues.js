const express = require('express');
const db = require('../database');
const { authMiddleware } = require('../middleware/auth');
const { getTournamentLockTime, isTournamentLocked } = require('../services/lockHelper');
const router = express.Router();

function generateInviteCode() {
  const { randomBytes } = require('crypto');
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(6);
  return Array.from(bytes).map(b => alphabet[b % alphabet.length]).join('');
}

function createEmptyFantasyTeam(userId, leagueId, username, callback) {
  const teamName = `${username}'s Team`;
  db.run(
    `INSERT OR IGNORE INTO fantasy_teams (user_id, league_id, team_name, lineup)
     VALUES (?, ?, ?, ?)`,
    [userId, leagueId, teamName, '[]'],
    callback
  );
}

router.post('/', authMiddleware, async (req, res) => {
  const { name, tournamentId, isPublic } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ message: 'League name is required' });
  }
  if (name.trim().length > 40) {
    return res.status(400).json({ message: 'League name cannot exceed 40 characters' });
  }
  if (!tournamentId) {
    return res.status(400).json({ message: 'tournamentId is required' });
  }

  if (req.user.role !== 'admin') {
    const lockTime = await getTournamentLockTime(tournamentId).catch(() => null);
    if (isTournamentLocked(lockTime)) {
      return res.status(403).json({ message: 'This tournament has already started. You can no longer create leagues.' });
    }
  }

  const isPublicVal = isPublic === false ? 0 : 1;
  const inviteCode = isPublicVal === 0 ? generateInviteCode() : null;

  db.get(
    'SELECT id FROM leagues WHERE LOWER(name) = LOWER(?) AND tournament_id = ?',
    [name.trim(), tournamentId],
    (err, existing) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (existing) return res.status(400).json({ message: 'A league with this name already exists for this tournament' });
      insertLeague();
    }
  );

  function insertLeague() {
  db.run(
    `INSERT INTO leagues (name, creator_id, status, tournament_id, is_public, invite_code)
     VALUES (?, ?, 'active', ?, ?, ?)`,
    [name.trim(), req.user.id, tournamentId, isPublicVal, inviteCode],
    function (err) {
      if (err) return res.status(500).json({ message: 'Failed to create league' });

      const leagueId = this.lastID;

      if (req.user.role === 'admin') {
        return res.status(201).json({ id: leagueId, name: name.trim(), invite_code: inviteCode });
      }

      db.run('INSERT INTO league_members (league_id, user_id) VALUES (?, ?)', [leagueId, req.user.id], (err) => {
        if (err) return res.status(500).json({ message: 'Failed to add creator to league' });

        createEmptyFantasyTeam(req.user.id, leagueId, req.user.username, (err) => {
          if (err) console.error('Failed to create empty fantasy team for creator:', err.message);
          res.status(201).json({ id: leagueId, name: name.trim(), invite_code: inviteCode });
        });
      });
    }
  );
  } // end insertLeague
});

router.get('/:id/info', authMiddleware, (req, res) => {
  const leagueId = parseInt(req.params.id, 10);
  if (!leagueId) return res.status(400).json({ message: 'Invalid league ID' });

  db.get(
    `SELECT l.id, l.name, l.tournament_id, l.status,
            t.status AS tournament_status
     FROM leagues l
     LEFT JOIN tournaments t ON t.id = l.tournament_id
     WHERE l.id = ?`,
    [leagueId],
    (err, row) => {
      if (err) return res.status(500).json({ message: 'Database error' });
      if (!row) return res.status(404).json({ message: 'League not found' });
      res.json(row);
    }
  );
});

router.get('/', authMiddleware, (req, res) => {
  const isAdmin = req.user.role === 'admin';

  const sql = isAdmin
    ? `SELECT l.*,
              t.name AS tournament_name,
              t.status AS tournament_status,
              (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id) AS member_count
       FROM leagues l
       LEFT JOIN tournaments t ON t.id = l.tournament_id
       ORDER BY l.created_at DESC`
    : `SELECT l.*,
              t.name AS tournament_name,
              t.status AS tournament_status,
              (SELECT COUNT(*) FROM league_members lm WHERE lm.league_id = l.id) AS member_count
       FROM leagues l
       JOIN league_members m ON m.league_id = l.id
       LEFT JOIN tournaments t ON t.id = l.tournament_id
       WHERE m.user_id = ?
       ORDER BY l.created_at DESC`;

  const params = isAdmin ? [] : [req.user.id];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    res.json(rows || []);
  });
});

router.post('/:id/join', authMiddleware, async (req, res) => {
  if (req.user.role === 'admin') {
    return res.status(403).json({ message: 'Admins cannot join leagues as participants' });
  }

  const leagueId = parseInt(req.params.id, 10);
  const { inviteCode } = req.body || {};

  db.get('SELECT * FROM leagues WHERE id = ?', [leagueId], async (err, league) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!league) return res.status(404).json({ message: 'League not found' });
    if (league.status !== 'active') return res.status(400).json({ message: 'League not active' });

    if (req.user.role !== 'admin') {
      const lockTime = await getTournamentLockTime(league.tournament_id).catch(() => null);
      if (isTournamentLocked(lockTime)) {
        return res.status(403).json({ message: 'This tournament has already started. You can no longer join leagues.' });
      }
    }

    const isPublic = !(league.is_public === 0 || league.is_public === false);

    if (!isPublic) {
      const provided = (inviteCode || '').toUpperCase();
      const stored = (league.invite_code || '').toUpperCase();
      if (!provided || provided !== stored) {
        return res.status(400).json({ message: 'Invalid invite code' });
      }
    }

    db.run('INSERT INTO league_members (league_id, user_id) VALUES (?, ?)', [leagueId, req.user.id], (err) => {
      if (err) {
        if (err.code === 'SQLITE_CONSTRAINT') return res.status(400).json({ message: 'Already joined' });
        return res.status(500).json({ message: 'Failed to join' });
      }

      createEmptyFantasyTeam(req.user.id, leagueId, req.user.username, (err) => {
        if (err) console.error('Failed to create empty fantasy team on join:', err.message);
        res.json({ leagueId, message: 'Joined successfully' });
      });
    });
  });
});

router.delete('/:id/leave', authMiddleware, (req, res) => {
  const leagueId = parseInt(req.params.id, 10);

  db.run('DELETE FROM fantasy_teams WHERE league_id = ? AND user_id = ?', [leagueId, req.user.id], (err) => {
    if (err) return res.status(500).json({ message: 'Failed to delete team' });

    db.run('DELETE FROM league_members WHERE league_id = ? AND user_id = ?', [leagueId, req.user.id], (err) => {
      if (err) return res.status(500).json({ message: 'Failed to leave' });
      res.json({ message: 'Left successfully' });
    });
  });
});

router.get('/:id/members', authMiddleware, (req, res) => {
  const leagueId = parseInt(req.params.id, 10);

  db.get('SELECT * FROM leagues WHERE id = ?', [leagueId], (err, league) => {
    if (err) return res.status(500).json({ message: 'Database error' });
    if (!league) return res.status(404).json({ message: 'League not found' });

    db.all(
      `SELECT u.id, u.username, u.country_code, u.profile_picture, u.role, lm.joined_at
       FROM league_members lm
       JOIN users u ON u.id = lm.user_id
       WHERE lm.league_id = ?
       ORDER BY lm.joined_at ASC`,
      [leagueId],
      (err, members) => {
        if (err) return res.status(500).json({ message: 'Database error' });
        res.json({ league, members: members || [] });
      }
    );
  });
});

router.patch('/:id/name', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  const leagueId = parseInt(req.params.id, 10);
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ message: 'Name required' });
  if (name.trim().length > 40) return res.status(400).json({ message: 'League name cannot exceed 40 characters' });

  db.get('SELECT tournament_id FROM leagues WHERE id = ?', [leagueId], (err, league) => {
    if (!league) return res.status(404).json({ message: 'League not found' });

    db.get(
      'SELECT id FROM leagues WHERE LOWER(name) = LOWER(?) AND tournament_id = ? AND id != ?',
      [name.trim(), league.tournament_id, leagueId],
      (err, existing) => {
        if (existing) return res.status(400).json({ message: 'Name already taken in this tournament' });
        db.run('UPDATE leagues SET name = ? WHERE id = ?', [name.trim(), leagueId], (err) => {
          if (err) return res.status(500).json({ message: 'Failed to rename' });
          res.json({ message: 'League renamed' });
        });
      }
    );
  });
});

router.delete('/:id', authMiddleware, (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin only' });
  const leagueId = parseInt(req.params.id, 10);

  db.run('BEGIN', (err) => {
    if (err) return res.status(500).json({ message: 'Failed to start transaction' });

    const rollback = (msg) => db.run('ROLLBACK', () => res.status(500).json({ message: msg }));

    db.run('DELETE FROM fantasy_teams WHERE league_id = ?', [leagueId], (err) => {
      if (err) return rollback('Failed to delete teams');
      db.run('DELETE FROM league_members WHERE league_id = ?', [leagueId], (err) => {
        if (err) return rollback('Failed to delete members');
        db.run('DELETE FROM leagues WHERE id = ?', [leagueId], (err) => {
          if (err) return rollback('Failed to delete league');
          db.run('COMMIT', (err) => {
            if (err) return rollback('Failed to commit transaction');
            res.json({ message: 'League deleted' });
          });
        });
      });
    });
  });
});

module.exports = router;
