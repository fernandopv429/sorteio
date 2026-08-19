import express from 'express';
import path from 'path';
import cors from 'cors';
import apiRouter from './server/api';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API endpoints
app.use('/api', apiRouter);

// Serve static assets from dist
const distPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(distPath));

// Fallback for SPA routing
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`[Server] Sorteio Diário de Vagas (SQLite) rodando na porta ${PORT}`);
});
