import express, { Request, Response } from 'express';
import {
  getTodayKeySP,
  getTimeSP,
  ensureDayExists,
  getDayData,
  listAllDays,
  performDraw,
  resetDay,
  getStats,
  SEGMENTS
} from './db';

const router = express.Router();

// GET /api/today
router.get('/today', async (_req: Request, res: Response) => {
  try {
    const dateKey = getTodayKeySP();
    const time = getTimeSP();
    res.json({
      dateKey,
      time,
      timeZone: 'America/Sao_Paulo'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao obter data' });
  }
});

// GET /api/days
router.get('/days', async (_req: Request, res: Response) => {
  try {
    const days = await listAllDays();
    res.json({ days });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao listar dias' });
  }
});

// GET /api/day/:dateKey
router.get('/day/:dateKey', async (req: Request, res: Response) => {
  try {
    const { dateKey } = req.params;
    const today = getTodayKeySP();
    let data;
    if (dateKey === today) {
      data = await ensureDayExists(dateKey);
    } else {
      data = await getDayData(dateKey);
      // Se não encontrou nenhuma vaga gravada para esse dia, inicializa
      if (!data.pool || data.pool.length === 0) {
        data = await ensureDayExists(dateKey);
      }
    }
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao obter dados do dia' });
  }
});

// POST /api/day/:dateKey/draw
router.post('/day/:dateKey/draw', async (req: Request, res: Response) => {
  try {
    const { dateKey } = req.params;
    const { consultor } = req.body || {};
    if (!consultor || !consultor.trim()) {
      return res.status(400).json({ error: 'Digite seu nome para sortear.' });
    }

    const result = await performDraw(dateKey, consultor);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao realizar sorteio' });
  }
});

// POST /api/day/:dateKey/reset
router.post('/day/:dateKey/reset', async (req: Request, res: Response) => {
  try {
    const { dateKey } = req.params;
    const data = await resetDay(dateKey);
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao reiniciar o dia' });
  }
});

// GET /api/stats
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao obter estatísticas' });
  }
});

// GET /api/segments
router.get('/segments', (_req: Request, res: Response) => {
  res.json({ segments: SEGMENTS });
});

// GET /api/export/:dateKey (CSV)
router.get('/export/:dateKey', async (req: Request, res: Response) => {
  try {
    const { dateKey } = req.params;
    const data = await getDayData(dateKey);
    
    // Gera CSV
    let csv = 'Codigo;Nome;Segmento;Status;Consultor;Hora\n';
    data.pool.forEach((v) => {
      csv += `"${v.codigo}";"${v.nome.replace(/"/g, '""')}";"${v.segmento}";"${v.status}";"${(v.consultor || '').replace(/"/g, '""')}";"${v.hora || ''}"\n`;
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="sorteio-vagas-${dateKey}.csv"`);
    res.send('\uFEFF' + csv);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao exportar CSV' });
  }
});

export default router;
