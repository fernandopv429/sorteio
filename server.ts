import express from 'express';
import path from 'path';
import cors from 'cors';
import apiRouter from './server/api';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = '0.0.0.0';

app.use(cors());
app.use(express.json());

// Healthcheck endpoint for Coolify / Docker
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// API endpoints
app.use('/api', apiRouter);

// Serve static assets from dist
const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));

// Fallback for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`[Server] Sorteio Diário de Vagas (SQLite) rodando em http://${HOST}:${PORT}`);
});
