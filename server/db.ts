import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';

const DB_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'sorteio.sqlite');

export interface Segment {
  key: string;
  label: string;
  prefix: string;
  colorHex: string;
  vagas: string[];
}

export const SEGMENTS: Segment[] = [
  {
    key: 'seguranca',
    label: 'Segurança',
    prefix: 'SEG',
    colorHex: '#4E82C9',
    vagas: [
      'Controlador de Acesso – Nível Brasil',
      'Vigilante – Nível Brasil',
      'Porteiro – Nível Brasil',
      'Vigilante Patrimonial – Nível Brasil',
      'Vigilante CFTV – Nível Brasil',
      'Vigilante Líder – Nível Brasil',
      'Bombeiro Civil – Nível Brasil',
      'Zelador – Nível Brasil',
      'Vigilante Motorista de Carro-Forte – Nível Brasil',
      'Vigilante de Escolta Armada – Nível Brasil'
    ]
  },
  {
    key: 'servicos',
    label: 'Serviços e Atendimento',
    prefix: 'SER',
    colorHex: '#CE8A3D',
    vagas: [
      'Auxiliar de Limpeza – Nível Brasil',
      'Atendente de Caixa – Nível Brasil',
      'Recepcionista – Nível Brasil',
      'Frentista – Nível Brasil',
      'Caixa Bancário – Nível Brasil',
      'Auxiliar de Logística – Nível Brasil'
    ]
  },
  {
    key: 'saude',
    label: 'Saúde',
    prefix: 'SAU',
    colorHex: '#3FA88C',
    vagas: [
      'Técnico de Enfermagem – Nível Brasil'
    ]
  }
];

export interface Vaga {
  id: string;
  codigo: string;
  nome: string;
  segmento: string;
  status: 'disponivel' | 'sorteada';
  consultor: string | null;
  hora: string | null;
  ts?: number | null;
}

export interface DrawLogEntry {
  id: string;
  dateKey: string;
  consultor: string;
  vagas: string[];
  vagas_detalhes?: Vaga[];
  hora: string;
  ts: number;
}

export interface DayData {
  dateKey: string;
  pool: Vaga[];
  log: DrawLogEntry[];
}

let dbInstance: Database | null = null;
let SQL: any = null;

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function defaultPoolForDate(dateKey: string): Vaga[] {
  const pool: Vaga[] = [];
  SEGMENTS.forEach((seg) => {
    seg.vagas.forEach((nome, idx) => {
      pool.push({
        id: `${dateKey}-${seg.key}-${slugify(nome)}`,
        codigo: `${seg.prefix}-${String(idx + 1).padStart(2, '0')}`,
        nome,
        segmento: seg.key,
        status: 'disponivel',
        consultor: null,
        hora: null,
        ts: null
      });
    });
  });
  return pool;
}

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  if (!SQL) {
    SQL = await initSqlJs();
  }

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  if (fs.existsSync(DB_PATH)) {
    try {
      const fileBuffer = fs.readFileSync(DB_PATH);
      dbInstance = new SQL.Database(fileBuffer);
    } catch (err) {
      console.error('Erro ao ler base SQLite existente, recriando:', err);
      dbInstance = new SQL.Database();
    }
  } else {
    dbInstance = new SQL.Database();
  }

  initTables(dbInstance);
  saveDb();
  return dbInstance;
}

function initTables(db: Database) {
  db.run(`
    CREATE TABLE IF NOT EXISTS days (
      date_key TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vacancies (
      id TEXT PRIMARY KEY,
      date_key TEXT NOT NULL,
      codigo TEXT NOT NULL,
      nome TEXT NOT NULL,
      segmento TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'disponivel',
      consultor TEXT,
      hora TEXT,
      ts INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(date_key) REFERENCES days(date_key)
    );

    CREATE TABLE IF NOT EXISTS vacancy_templates (
      id TEXT PRIMARY KEY,
      codigo TEXT NOT NULL,
      nome TEXT NOT NULL,
      segmento TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS draw_logs (
      id TEXT PRIMARY KEY,
      date_key TEXT NOT NULL,
      consultor TEXT NOT NULL,
      vagas_json TEXT NOT NULL,
      hora TEXT NOT NULL,
      ts INTEGER NOT NULL,
      FOREIGN KEY(date_key) REFERENCES days(date_key)
    );

    CREATE INDEX IF NOT EXISTS idx_vacancies_date ON vacancies(date_key);
    CREATE INDEX IF NOT EXISTS idx_logs_date ON draw_logs(date_key);
  `);

  // Seed vacancy_templates once from SEGMENTS if not yet seeded
  const seededRes = db.exec("SELECT value FROM app_meta WHERE key = 'templates_seeded'");
  const isSeeded = seededRes.length > 0 && seededRes[0].values.length > 0;

  if (!isSeeded) {
    const countRes = db.exec('SELECT COUNT(*) FROM vacancy_templates');
    const tplCount = countRes.length > 0 ? Number(countRes[0].values[0][0]) : 0;

    if (tplCount === 0) {
      const insertTpl = db.prepare(`
        INSERT INTO vacancy_templates (id, codigo, nome, segmento, sort_order)
        VALUES (?, ?, ?, ?, ?)
      `);
      let order = 0;
      SEGMENTS.forEach((seg) => {
        seg.vagas.forEach((nome, idx) => {
          const codigo = `${seg.prefix}-${String(idx + 1).padStart(2, '0')}`;
          const id = `tpl-${seg.key}-${slugify(nome)}`;
          insertTpl.run([id, codigo, nome, seg.key, order++]);
        });
      });
      insertTpl.free();
    }

    db.run("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('templates_seeded', '1')");
  }
}

export function saveDb(): void {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error('Erro ao persistir banco SQLite no disco:', err);
  }
}

export function getTodayKeySP(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return fmt.format(new Date()); // YYYY-MM-DD
}

export function getTimeSP(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());
}

export async function ensureDayExists(dateKey: string): Promise<DayData> {
  const db = await getDb();

  // Verifica se dia já existe
  const checkStmt = db.prepare('SELECT date_key FROM days WHERE date_key = :dateKey');
  checkStmt.bind({ ':dateKey': dateKey });
  const exists = checkStmt.step();
  checkStmt.free();

  if (!exists) {
    const now = Date.now();
    db.run('INSERT INTO days (date_key, created_at, updated_at) VALUES (?, ?, ?)', [dateKey, now, now]);

    // Carrega o modelo de vagas do banco (vacancy_templates)
    const tplStmt = db.prepare(`
      SELECT id, codigo, nome, segmento, sort_order
      FROM vacancy_templates
      ORDER BY sort_order ASC
    `);
    const templates: { id: string; codigo: string; nome: string; segmento: string; sort_order: number }[] = [];
    while (tplStmt.step()) {
      const row = tplStmt.getAsObject() as any;
      templates.push({
        id: row.id,
        codigo: row.codigo,
        nome: row.nome,
        segmento: row.segmento,
        sort_order: Number(row.sort_order ?? 0)
      });
    }
    tplStmt.free();

    const insertVaga = db.prepare(`
      INSERT INTO vacancies (id, date_key, codigo, nome, segmento, status, consultor, hora, ts, sort_order)
      VALUES (?, ?, ?, ?, ?, 'disponivel', NULL, NULL, NULL, ?)
    `);

    templates.forEach((tpl, idx) => {
      const vacId = `${dateKey}-${tpl.segmento}-${slugify(tpl.nome)}-${idx}`;
      insertVaga.run([vacId, dateKey, tpl.codigo, tpl.nome, tpl.segmento, idx]);
    });
    insertVaga.free();

    saveDb();
  }

  return getDayData(dateKey);
}

export async function getDayData(dateKey: string): Promise<DayData> {
  const db = await getDb();

  const vacStmt = db.prepare(`
    SELECT id, codigo, nome, segmento, status, consultor, hora, ts
    FROM vacancies
    WHERE date_key = :dateKey
    ORDER BY sort_order ASC
  `);
  vacStmt.bind({ ':dateKey': dateKey });

  const pool: Vaga[] = [];
  while (vacStmt.step()) {
    const row = vacStmt.getAsObject() as any;
    pool.push({
      id: row.id,
      codigo: row.codigo,
      nome: row.nome,
      segmento: row.segmento,
      status: row.status as 'disponivel' | 'sorteada',
      consultor: row.consultor || null,
      hora: row.hora || null,
      ts: row.ts ? Number(row.ts) : null
    });
  }
  vacStmt.free();

  const logStmt = db.prepare(`
    SELECT id, date_key, consultor, vagas_json, hora, ts
    FROM draw_logs
    WHERE date_key = :dateKey
    ORDER BY ts DESC
  `);
  logStmt.bind({ ':dateKey': dateKey });

  const log: DrawLogEntry[] = [];
  while (logStmt.step()) {
    const row = logStmt.getAsObject() as any;
    let vagasList: string[] = [];
    try {
      vagasList = JSON.parse(row.vagas_json);
    } catch {
      vagasList = [row.vagas_json];
    }
    log.push({
      id: row.id,
      dateKey: row.date_key,
      consultor: row.consultor,
      vagas: vagasList,
      hora: row.hora,
      ts: Number(row.ts)
    });
  }
  logStmt.free();

  return {
    dateKey,
    pool,
    log
  };
}

export async function listAllDays(): Promise<string[]> {
  const db = await getDb();
  const stmt = db.prepare('SELECT date_key FROM days ORDER BY date_key DESC');
  const days: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    days.push(row.date_key);
  }
  stmt.free();

  // Garante que o dia atual esteja presente
  const today = getTodayKeySP();
  if (!days.includes(today)) {
    days.unshift(today);
  }
  return days;
}

export interface DrawResult {
  status: 'ok' | 'partial' | 'empty' | 'conflict';
  vagas?: Vaga[];
}

export async function performDraw(dateKey: string, consultorName: string): Promise<DrawResult> {
  const db = await getDb();
  await ensureDayExists(dateKey);

  const cleanName = consultorName.trim();
  if (!cleanName) {
    throw new Error('Nome do consultor é obrigatório.');
  }

  // Buscar vagas disponíveis no SQLite
  const stmt = db.prepare(`
    SELECT id, codigo, nome, segmento, status, consultor, hora, ts
    FROM vacancies
    WHERE date_key = :dateKey AND status = 'disponivel'
    ORDER BY RANDOM()
    LIMIT 2
  `);
  stmt.bind({ ':dateKey': dateKey });

  const selected: any[] = [];
  while (stmt.step()) {
    selected.push(stmt.getAsObject());
  }
  stmt.free();

  if (selected.length === 0) {
    return { status: 'empty' };
  }

  const hora = getTimeSP();
  const ts = Date.now();

  const updateStmt = db.prepare(`
    UPDATE vacancies
    SET status = 'sorteada', consultor = :consultor, hora = :hora, ts = :ts
    WHERE id = :id AND status = 'disponivel'
  `);

  const confirmedVagas: Vaga[] = [];

  for (const v of selected) {
    updateStmt.bind({
      ':consultor': cleanName,
      ':hora': hora,
      ':ts': ts,
      ':id': v.id
    });
    updateStmt.step();
    updateStmt.reset();

    confirmedVagas.push({
      id: v.id,
      codigo: v.codigo,
      nome: v.nome,
      segmento: v.segmento,
      status: 'sorteada',
      consultor: cleanName,
      hora: hora,
      ts: ts
    });
  }
  updateStmt.free();

  if (confirmedVagas.length === 0) {
    return { status: 'conflict' };
  }

  // Grava o log
  const logId = `log-${ts}-${Math.random().toString(36).substring(2, 7)}`;
  const vagasList = confirmedVagas.map((v) => `${v.codigo} - ${v.nome}`);
  
  db.run(`
    INSERT INTO draw_logs (id, date_key, consultor, vagas_json, hora, ts)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [logId, dateKey, cleanName, JSON.stringify(vagasList), hora, ts]);

  db.run('UPDATE days SET updated_at = ? WHERE date_key = ?', [ts, dateKey]);

  saveDb();

  return {
    status: confirmedVagas.length === 2 ? 'ok' : 'partial',
    vagas: confirmedVagas
  };
}

export async function resetDay(dateKey: string): Promise<DayData> {
  const db = await getDb();
  await ensureDayExists(dateKey);

  const now = Date.now();

  db.run(`
    UPDATE vacancies
    SET status = 'disponivel', consultor = NULL, hora = NULL, ts = NULL
    WHERE date_key = ?
  `, [dateKey]);

  db.run(`
    DELETE FROM draw_logs
    WHERE date_key = ?
  `, [dateKey]);

  db.run('UPDATE days SET updated_at = ? WHERE date_key = ?', [now, dateKey]);

  saveDb();

  return getDayData(dateKey);
}

function getNextCodeForSegment(db: Database, dateKey: string, segmento: string): string {
  const segInfo = SEGMENTS.find((s) => s.key === segmento);
  const prefix = segInfo ? segInfo.prefix : 'VAG';

  let maxNum = 0;
  const extractNum = (codigo: string) => {
    const match = codigo.match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
    if (match) {
      const n = parseInt(match[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  };

  const vacStmt = db.prepare('SELECT codigo FROM vacancies WHERE date_key = :dateKey AND segmento = :seg');
  vacStmt.bind({ ':dateKey': dateKey, ':seg': segmento });
  while (vacStmt.step()) {
    const row = vacStmt.getAsObject() as any;
    if (row.codigo) extractNum(String(row.codigo));
  }
  vacStmt.free();

  const tplStmt = db.prepare('SELECT codigo FROM vacancy_templates WHERE segmento = :seg');
  tplStmt.bind({ ':seg': segmento });
  while (tplStmt.step()) {
    const row = tplStmt.getAsObject() as any;
    if (row.codigo) extractNum(String(row.codigo));
  }
  tplStmt.free();

  return `${prefix}-${String(maxNum + 1).padStart(2, '0')}`;
}

export async function addVacancy(
  dateKey: string,
  input: { nome: string; segmento: string; codigo?: string; applyToTemplate?: boolean }
): Promise<{ vaga: Vaga; dayData: DayData }> {
  const db = await getDb();
  await ensureDayExists(dateKey);

  const cleanName = (input.nome || '').trim();
  if (!cleanName) {
    throw new Error('O nome da vaga é obrigatório.');
  }

  const segInfo = SEGMENTS.find((s) => s.key === input.segmento);
  if (!segInfo) {
    throw new Error('Segmento inválido.');
  }

  const cleanCode = (input.codigo || '').trim().toUpperCase() || getNextCodeForSegment(db, dateKey, segInfo.key);

  // Determine next sort_order
  const maxOrderRes = db.prepare('SELECT COALESCE(MAX(sort_order), -1) as max_order FROM vacancies WHERE date_key = :dateKey');
  maxOrderRes.bind({ ':dateKey': dateKey });
  let nextOrder = 0;
  if (maxOrderRes.step()) {
    const row = maxOrderRes.getAsObject() as any;
    nextOrder = Number(row.max_order ?? -1) + 1;
  }
  maxOrderRes.free();

  const now = Date.now();
  const suffix = `${now.toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const id = `${dateKey}-${segInfo.key}-${slugify(cleanName) || 'vaga'}-${suffix}`;

  db.run(
    `INSERT INTO vacancies (id, date_key, codigo, nome, segmento, status, consultor, hora, ts, sort_order)
     VALUES (?, ?, ?, ?, ?, 'disponivel', NULL, NULL, NULL, ?)`,
    [id, dateKey, cleanCode, cleanName, segInfo.key, nextOrder]
  );

  if (input.applyToTemplate !== false) {
    const maxTplRes = db.exec('SELECT COALESCE(MAX(sort_order), -1) FROM vacancy_templates');
    const nextTplOrder =
      maxTplRes.length > 0 && maxTplRes[0].values.length > 0
        ? Number(maxTplRes[0].values[0][0]) + 1
        : 0;
    const tplId = `tpl-${segInfo.key}-${slugify(cleanName) || 'vaga'}-${suffix}`;
    db.run(
      `INSERT INTO vacancy_templates (id, codigo, nome, segmento, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [tplId, cleanCode, cleanName, segInfo.key, nextTplOrder]
    );
  }

  db.run('UPDATE days SET updated_at = ? WHERE date_key = ?', [now, dateKey]);
  saveDb();

  const vaga: Vaga = {
    id,
    codigo: cleanCode,
    nome: cleanName,
    segmento: segInfo.key,
    status: 'disponivel',
    consultor: null,
    hora: null,
    ts: null
  };

  const dayData = await getDayData(dateKey);
  return { vaga, dayData };
}

export async function deleteVacancy(
  dateKey: string,
  vacancyId: string,
  applyToTemplate = true
): Promise<DayData> {
  const db = await getDb();
  await ensureDayExists(dateKey);

  const findStmt = db.prepare(
    'SELECT id, codigo, nome, segmento FROM vacancies WHERE id = :id AND date_key = :dateKey'
  );
  findStmt.bind({ ':id': vacancyId, ':dateKey': dateKey });
  const found = findStmt.step() ? (findStmt.getAsObject() as any) : null;
  findStmt.free();

  if (!found) {
    throw new Error('Vaga não encontrada.');
  }

  db.run('DELETE FROM vacancies WHERE id = ? AND date_key = ?', [vacancyId, dateKey]);

  if (applyToTemplate) {
    db.run(
      'DELETE FROM vacancy_templates WHERE segmento = ? AND (codigo = ? OR LOWER(nome) = LOWER(?))',
      [found.segmento, found.codigo, found.nome]
    );
  }

  const now = Date.now();
  db.run('UPDATE days SET updated_at = ? WHERE date_key = ?', [now, dateKey]);
  saveDb();

  return getDayData(dateKey);
}

export async function getStats(): Promise<{
  totalDraws: number;
  totalDays: number;
  consultoresCount: number;
  topConsultores: { name: string; count: number }[];
  vagasCountBySegment: { segmento: string; total: number; sorteadas: number }[];
}> {
  const db = await getDb();

  let totalDraws = 0;
  const countDraws = db.exec('SELECT COUNT(*) as c FROM draw_logs');
  if (countDraws.length > 0 && countDraws[0].values.length > 0) {
    totalDraws = Number(countDraws[0].values[0][0]);
  }

  let totalDays = 0;
  const countDays = db.exec('SELECT COUNT(*) as c FROM days');
  if (countDays.length > 0 && countDays[0].values.length > 0) {
    totalDays = Number(countDays[0].values[0][0]);
  }

  const topStmt = db.prepare(`
    SELECT consultor, COUNT(*) as cnt
    FROM draw_logs
    GROUP BY consultor
    ORDER BY cnt DESC
    LIMIT 5
  `);
  const topConsultores: { name: string; count: number }[] = [];
  while (topStmt.step()) {
    const row = topStmt.getAsObject() as any;
    topConsultores.push({ name: row.consultor, count: Number(row.cnt) });
  }
  topStmt.free();

  const segStmt = db.prepare(`
    SELECT segmento,
           COUNT(*) as total,
           SUM(CASE WHEN status = 'sorteada' THEN 1 ELSE 0 END) as sorteadas
    FROM vacancies
    GROUP BY segmento
  `);
  const vagasCountBySegment: { segmento: string; total: number; sorteadas: number }[] = [];
  while (segStmt.step()) {
    const row = segStmt.getAsObject() as any;
    vagasCountBySegment.push({
      segmento: row.segmento,
      total: Number(row.total || 0),
      sorteadas: Number(row.sorteadas || 0)
    });
  }
  segStmt.free();

  return {
    totalDraws,
    totalDays,
    consultoresCount: topConsultores.length,
    topConsultores,
    vagasCountBySegment
  };
}
