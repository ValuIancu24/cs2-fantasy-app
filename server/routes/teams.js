const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const teamsPath = path.join(__dirname, '..', '..', 'data', 'teams.json');

router.get('/', (req, res) => {
  fs.readFile(teamsPath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ message: 'Failed to load teams' });
    res.json(JSON.parse(data));
  });
});

module.exports = router;