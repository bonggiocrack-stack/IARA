const express = require('express');
const app = express();

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/', (req, res) => res.send('OK'));

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(3000, () => console.log('Running on 3000'));
}
