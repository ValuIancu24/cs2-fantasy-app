const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const playersPath = path.join(__dirname, '..', '..', 'data', 'players.json');

router.get('/', (req, res) => {
  fs.readFile(playersPath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ message: 'Failed to load players' });
    res.json(JSON.parse(data));
  });
});

module.exports = router;