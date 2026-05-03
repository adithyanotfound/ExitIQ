/**
 * Express Server – TensorX Collateral Valuation Engine
 */

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const apiRouter = require('./routes/api');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api', apiRouter);

// SPA fallback (Express 5 wildcard syntax)
app.get('{*path}', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  ⚡ TensorX Collateral Engine running on http://localhost:${PORT}\n`);
});
