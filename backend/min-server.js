const express = require('express');
const app = express();
app.get('/api/health', (req, res) => res.json({ ok: true, env: process.env.NODE_ENV || 'unknown' }));
app.get('/api/debug-env', (req, res) => {
  const keys = Object.keys(process.env).filter(k => !k.includes('SECRET') && !k.includes('TOKEN') && !k.includes('URL'));
  res.json({ keys: keys.slice(0, 20) });
});
if (process.env.VERCEL) {
  module.exports = app;
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Minimal backend listening on ${PORT}`));
}
