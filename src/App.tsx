import React, { useState, useEffect, useCallback, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  RotateCcw,
  Sparkles,
  Calendar,
  Clock,
  Database,
  BarChart3,
  Download,
  AlertCircle,
  CheckCircle2,
  Users,
  ShieldCheck,
  Briefcase,
  HeartPulse,
  Search,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  Info
} from 'lucide-react';

interface SegmentInfo {
  key: string;
  label: string;
  prefix: string;
  colorHex: string;
  icon: React.ReactNode;
}

const SEGMENTS: SegmentInfo[] = [
  {
    key: 'seguranca',
    label: 'Segurança',
    prefix: 'SEG',
    colorHex: '#4E82C9',
    icon: <ShieldCheck className="w-4 h-4 text-[#4E82C9]" />
  },
  {
    key: 'servicos',
    label: 'Serviços e Atendimento',
    prefix: 'SER',
    colorHex: '#CE8A3D',
    icon: <Briefcase className="w-4 h-4 text-[#CE8A3D]" />
  },
  {
    key: 'saude',
    label: 'Saúde',
    prefix: 'SAU',
    colorHex: '#3FA88C',
    icon: <HeartPulse className="w-4 h-4 text-[#3FA88C]" />
  }
];

interface Vaga {
  id: string;
  codigo: string;
  nome: string;
  segmento: string;
  status: 'disponivel' | 'sorteada';
  consultor: string | null;
  hora: string | null;
  ts?: number | null;
}

interface DrawLogEntry {
  id: string;
  dateKey: string;
  consultor: string;
  vagas: string[];
  hora: string;
  ts: number;
}

interface DayData {
  dateKey: string;
  pool: Vaga[];
  log: DrawLogEntry[];
}

interface StatsData {
  totalDraws: number;
  totalDays: number;
  consultoresCount: number;
  topConsultores: { name: string; count: number }[];
  vagasCountBySegment: { segmento: string; total: number; sorteadas: number }[];
}

function formatLongDateSP(dateKey: string): string {
  if (!dateKey) return '';
  const parts = dateKey.split('-');
  if (parts.length !== 3) return dateKey;
  const d = new Date(Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 12, 0, 0));
  const s = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function App() {
  const [todayKey, setTodayKey] = useState<string>('');
  const [viewingKey, setViewingKey] = useState<string>('');
  const [dayData, setDayData] = useState<DayData>({ dateKey: '', pool: [], log: [] });
  const [allDays, setAllDays] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);

  // Form input & errors
  const [consultorName, setConsultorName] = useState<string>('');
  const [nameError, setNameError] = useState<string>('');
  const [logSearch, setLogSearch] = useState<string>('');

  // Modals
  const [revealModal, setRevealModal] = useState<{
    show: boolean;
    vagas: Vaga[];
    partial: boolean;
    flipped: boolean[];
  }>({
    show: false,
    vagas: [],
    partial: false,
    flipped: []
  });

  const [dupModal, setDupModal] = useState<{
    show: boolean;
    name: string;
    lastLog?: DrawLogEntry;
  }>({
    show: false,
    name: ''
  });

  const [resetModal, setResetModal] = useState<boolean>(false);
  const [statsModal, setStatsModal] = useState<boolean>(false);
  const [statsData, setStatsData] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(false);
  const [dbModal, setDbModal] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  const isToday = viewingKey === todayKey;

  // Load server today key
  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch('/api/today');
      if (res.ok) {
        const data = await res.json();
        return data.dateKey as string;
      }
    } catch (e) {
      console.error('Falha ao conectar com API:', e);
    }
    // Fallback local SP date
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    return fmt.format(new Date());
  }, []);

  // Fetch specific day data from SQLite
  const fetchDayData = useCallback(async (dateKey: string) => {
    try {
      const res = await fetch(`/api/day/${dateKey}`);
      if (res.ok) {
        const data: DayData = await res.json();
        setDayData(data);
        return data;
      }
    } catch (e) {
      console.error(`Erro ao carregar dados do dia ${dateKey}:`, e);
    }
    return null;
  }, []);

  // Fetch list of days in SQLite database
  const fetchDaysList = useCallback(async () => {
    try {
      const res = await fetch('/api/days');
      if (res.ok) {
        const data = await res.json();
        setAllDays(data.days || []);
      }
    } catch (e) {
      console.error('Erro ao listar dias gravados:', e);
    }
  }, []);

  // Fetch statistics
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStatsData(data);
      }
    } catch (e) {
      console.error('Erro ao carregar estatísticas:', e);
    } finally {
      setStatsLoading(false);
    }
  };

  // Initial Boot
  useEffect(() => {
    let mounted = true;
    (async () => {
      setIsLoading(true);
      const serverToday = await fetchToday();
      if (!mounted) return;
      setTodayKey(serverToday);
      setViewingKey(serverToday);
      await Promise.all([fetchDayData(serverToday), fetchDaysList()]);
      setIsLoading(false);
    })();

    // Polling every 3.5s for real-time synchronization across team members
    const interval = setInterval(async () => {
      const currentServerToday = await fetchToday();
      if (currentServerToday && currentServerToday !== todayKey) {
        setTodayKey(currentServerToday);
      }
      if (viewingKey) {
        const updated = await fetchDayData(viewingKey);
        if (updated) {
          setDayData(updated);
        }
      }
    }, 3500);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchToday, fetchDayData, fetchDaysList, todayKey, viewingKey]);

  // Handle switching dates
  const handleSelectDate = async (newDate: string) => {
    if (!newDate) return;
    setIsLoading(true);
    setViewingKey(newDate);
    await fetchDayData(newDate);
    setIsLoading(false);
  };

  const handleBackToToday = async () => {
    if (viewingKey === todayKey) return;
    setIsLoading(true);
    setViewingKey(todayKey);
    await fetchDayData(todayKey);
    setIsLoading(false);
  };

  // Fire confetti celebration
  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#C9A227', '#E0BC3E', '#4E82C9', '#CE8A3D', '#3FA88C']
      });
    } catch (e) {
      // safe fallback
    }
  };

  // Sorteio / Draw execution
  const executeDraw = async (name: string) => {
    setIsDrawing(true);
    setNameError('');
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/day/${todayKey}/draw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consultor: name })
      });

      const result = await res.json();

      if (!res.ok) {
        throw new Error(result.error || 'Erro ao processar sorteio no SQLite.');
      }

      // Refresh state
      await fetchDayData(todayKey);
      await fetchDaysList();

      if (result.status === 'empty') {
        setStatusMessage({
          type: 'error',
          text: 'Todas as vagas de hoje já foram sorteadas!'
        });
      } else if (result.status === 'conflict') {
        setStatusMessage({
          type: 'error',
          text: 'Conflito de concorrência: outra pessoa pegou essas vagas no mesmo milissegundo. Tente novamente!'
        });
      } else if (result.vagas && result.vagas.length > 0) {
        // Success
        setRevealModal({
          show: true,
          vagas: result.vagas,
          partial: result.status === 'partial',
          flipped: result.vagas.map(() => false)
        });

        triggerConfetti();

        // Animate card flipping sequence
        setTimeout(() => {
          setRevealModal((prev) => ({
            ...prev,
            flipped: prev.vagas.map(() => true)
          }));
        }, 150);

        setConsultorName('');
      }
    } catch (err: any) {
      console.error('Erro no sorteio:', err);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Erro ao comunicar com o banco SQLite.'
      });
    } finally {
      setIsDrawing(false);
    }
  };

  // Sorteio Click Handler (with duplicate check)
  const handleDrawClick = () => {
    const clean = consultorName.trim();
    if (!clean) {
      setNameError('Digite seu nome completo para sortear.');
      return;
    }

    const normalized = clean.toLowerCase();
    const existingDraws = (dayData.log || []).filter(
      (l) => l.consultor.trim().toLowerCase() === normalized
    );

    if (existingDraws.length > 0) {
      setDupModal({
        show: true,
        name: clean,
        lastLog: existingDraws[0]
      });
      return;
    }

    executeDraw(clean);
  };

  // Reset day handler
  const handleResetDay = async () => {
    setResetModal(false);
    setIsLoading(true);
    try {
      const res = await fetch(`/api/day/${viewingKey}/reset`, {
        method: 'POST'
      });
      if (res.ok) {
        await fetchDayData(viewingKey);
        await fetchDaysList();
        setStatusMessage({
          type: 'info',
          text: 'O sorteio do dia foi reiniciado com sucesso no SQLite.'
        });
      }
    } catch (e) {
      console.error('Erro ao reiniciar dia:', e);
    } finally {
      setIsLoading(false);
    }
  };

  // CSV Export Download
  const handleExportCsv = () => {
    window.location.href = `/api/export/${viewingKey}`;
  };

  // Filtered log
  const filteredLog = useMemo(() => {
    const list = dayData.log || [];
    if (!logSearch.trim()) return list;
    const term = logSearch.toLowerCase();
    return list.filter(
      (entry) =>
        entry.consultor.toLowerCase().includes(term) ||
        entry.vagas.some((v) => v.toLowerCase().includes(term)) ||
        entry.hora.toLowerCase().includes(term)
    );
  }, [dayData.log, logSearch]);

  const pool = dayData.pool || [];
  const vagasDisponiveis = pool.filter((v) => v.status === 'disponivel').length;
  const totalVagas = pool.length || 14;

  const getSegmentMeta = (key: string) => {
    return SEGMENTS.find((s) => s.key === key) || SEGMENTS[0];
  };

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-7 pb-20 font-sans-plex">
      {/* Top Header */}
      <header className="mb-7">
        <div className="flex items-center justify-between gap-3 mb-2.5">
          <div className="flex items-center gap-3 flex-1">
            <span className="font-mono-plex tracking-[0.14em] uppercase text-[#C9A227] text-xs font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#C9A227]"></span>
              Equipe Trabalhista
            </span>
            <div className="flex-1 h-[1px] bg-gradient-to-r from-[#2A3240] to-transparent hidden sm:block"></div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchStats();
                setStatsModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono-plex rounded border border-[#2A3240] bg-[#171C24] text-[#9AA3B3] hover:text-[#ECEEF2] hover:border-[#C9A227] transition"
              title="Ver Estatísticas Gerais"
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#C9A227]" />
              <span className="hidden sm:inline">Estatísticas</span>
            </button>

            <button
              onClick={() => setDbModal(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono-plex rounded border border-[#2A3240] bg-[#171C24] text-[#9AA3B3] hover:text-[#ECEEF2] hover:border-[#4E82C9] transition"
              title="Status do Banco SQLite"
            >
              <Database className="w-3.5 h-3.5 text-[#4E82C9]" />
              <span className="hidden sm:inline">SQLite Ativo</span>
            </button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
          <div>
            <h1 className="font-serif-fraunces font-semibold text-3xl sm:text-4xl text-[#ECEEF2] tracking-tight m-0">
              Sorteio Diário de Vagas
            </h1>
            <p className="text-[#9AA3B3] text-sm sm:text-base mt-1">
              {isToday ? (
                <span>
                  <strong className="text-[#ECEEF2] font-semibold">{formatLongDateSP(viewingKey || todayKey)}</strong> · Pool diário reiniciado à 00h00
                </span>
              ) : (
                <span>
                  Visualizando <strong className="text-[#E0BC3E]">{formatLongDateSP(viewingKey)}</strong>{' '}
                  <span className="text-[#69707F] font-mono-plex text-xs">(somente leitura do histórico)</span>
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-mono-plex rounded-md border border-[#2A3240] bg-[#171C24] text-[#ECEEF2] hover:bg-[#1D2430] hover:border-[#C9A227] transition"
            >
              <Download className="w-3.5 h-3.5 text-[#C9A227]" />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* Summary Bar */}
        <div className="mt-4 p-3.5 px-4 bg-[#171C24] border border-[#2A3240] rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="font-mono-plex text-xs sm:text-sm text-[#9AA3B3]">
            <b className="text-[#ECEEF2] font-semibold">{vagasDisponiveis}</b> de{' '}
            <b className="text-[#ECEEF2] font-semibold">{totalVagas}</b> vagas disponíveis
          </div>

          {/* Visual vacancy ticks */}
          <div className="flex items-center gap-1">
            {pool.map((vaga, idx) => (
              <div
                key={vaga.id || idx}
                title={`${vaga.codigo} - ${vaga.nome} (${vaga.status})`}
                className={`w-2.5 sm:w-3 h-4 rounded-xs border transition-colors ${
                  vaga.status === 'disponivel'
                    ? 'bg-[#C9A227] border-[#E0BC3E] opacity-90'
                    : 'bg-[#232B38] border-[#2A3240] opacity-40'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 font-mono-plex text-xs text-[#9AA3B3] uppercase tracking-wider">
            <span className="w-2 h-2 rounded-full bg-[#3FA88C] live-pulse"></span>
            <span>SQLite em tempo real</span>
          </div>
        </div>

        {/* Viewing past day warning banner */}
        {!isToday && (
          <div className="mt-3.5 p-3 px-4 rounded-lg bg-[rgba(201,162,39,0.14)] border border-[#C9A227]/40 text-[#E0BC3E] text-xs sm:text-sm flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0 text-[#C9A227]" />
              <span>Você está consultando um dia anterior gravado no SQLite. Os sorteios de hoje continuam ativos.</span>
            </div>
            <button
              onClick={handleBackToToday}
              className="px-3 py-1.5 rounded text-xs font-semibold border border-[#C9A227] text-[#E0BC3E] hover:bg-[#C9A227]/20 transition cursor-pointer"
            >
              Voltar para Hoje
            </button>
          </div>
        )}

        {/* Global status message */}
        {statusMessage && (
          <div
            className={`mt-3 p-3 px-4 rounded-lg text-xs sm:text-sm flex items-center justify-between gap-2 ${
              statusMessage.type === 'error'
                ? 'bg-[#C1503F]/15 border border-[#C1503F]/40 text-[#F0B3AA]'
                : 'bg-[#3FA88C]/15 border border-[#3FA88C]/40 text-[#A6E3D4]'
            }`}
          >
            <div className="flex items-center gap-2">
              {statusMessage.type === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0 text-[#C1503F]" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 text-[#3FA88C]" />
              )}
              <span>{statusMessage.text}</span>
            </div>
            <button
              onClick={() => setStatusMessage(null)}
              className="text-xs opacity-70 hover:opacity-100 font-mono-plex"
            >
              ✕
            </button>
          </div>
        )}
      </header>

      {/* Main Grid: Left Panel (Draw & Controls) + Right Panel (Logs) */}
      <main className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
        {/* Draw Panel */}
        <section
          className={`bg-[#171C24] border border-[#2A3240] rounded-2xl p-5 sm:p-6 shadow-md transition-opacity ${
            !isToday ? 'opacity-70 pointer-events-none' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <h2 className="font-serif-fraunces font-semibold text-lg sm:text-xl text-[#ECEEF2] m-0">
              Sortear vagas
            </h2>
            <Sparkles className="w-4 h-4 text-[#C9A227]" />
          </div>
          <p className="text-[#69707F] text-xs sm:text-sm mb-4">
            Digite seu nome e receba automaticamente 2 vagas do pool.
          </p>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="consultor-input"
                className="block text-[0.74rem] font-semibold tracking-wider uppercase text-[#9AA3B3] mb-1.5 font-mono-plex"
              >
                Seu Nome Completo
              </label>
              <input
                id="consultor-input"
                type="text"
                value={consultorName}
                onChange={(e) => {
                  setConsultorName(e.target.value);
                  if (nameError) setNameError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && isToday && vagasDisponiveis > 0 && !isDrawing) {
                    handleDrawClick();
                  }
                }}
                placeholder="Ex.: Fernanda Souza"
                maxLength={60}
                disabled={!isToday || vagasDisponiveis === 0 || isDrawing}
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#2A3240] bg-[#0B0D12] text-[#ECEEF2] placeholder-[#69707F] text-sm focus:outline-none focus:border-[#C9A227] transition"
              />
              {nameError && (
                <div className="text-[#F0B3AA] text-xs mt-1.5 flex items-center gap-1 animate-fadeIn">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {nameError}
                </div>
              )}
            </div>

            <button
              onClick={handleDrawClick}
              disabled={!isToday || vagasDisponiveis === 0 || isDrawing}
              className="w-full mt-2 font-semibold text-sm py-3 px-4 rounded-lg bg-gradient-to-b from-[#E0BC3E] to-[#C9A227] text-[#1A1305] hover:brightness-105 active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed transition shadow cursor-pointer flex items-center justify-center gap-2"
            >
              {isDrawing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Registrando no SQLite…</span>
                </>
              ) : vagasDisponiveis === 0 ? (
                'Sem vagas disponíveis hoje'
              ) : vagasDisponiveis === 1 ? (
                'Sortear última vaga disponível'
              ) : (
                'Sortear 2 vagas'
              )}
            </button>
          </div>

          {vagasDisponiveis === 0 && isToday && (
            <div className="mt-4 p-3 rounded-lg bg-[#C1503F]/15 border border-[#C1503F]/30 text-[#F0B3AA] text-xs leading-relaxed">
              As 14 vagas de hoje já foram sorteadas por outros consultores. O pool reabre à 00h00 pelo servidor.
            </div>
          )}

          <div className="h-[1px] bg-[#2A3240] my-5"></div>

          {/* Reset Action */}
          <div>
            <div className="text-xs text-[#69707F] mb-2">Errou um sorteio ou precisa testar?</div>
            <button
              onClick={() => setResetModal(true)}
              className="w-full py-2 px-3 text-xs font-semibold rounded-lg bg-[#C1503F]/15 border border-[#C1503F]/35 text-[#F0B3AA] hover:bg-[#C1503F]/25 transition cursor-pointer flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reiniciar sorteio do dia ({viewingKey})
            </button>
          </div>

          <div className="h-[1px] bg-[#2A3240] my-5"></div>

          {/* History selector */}
          <div>
            <label
              htmlFor="day-select"
              className="block text-[0.74rem] font-semibold tracking-wider uppercase text-[#9AA3B3] mb-1.5 font-mono-plex"
            >
              Consultar Dias Anteriores
            </label>
            <div className="relative">
              <select
                id="day-select"
                value={viewingKey}
                onChange={(e) => handleSelectDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-[#2A3240] bg-[#0B0D12] text-[#ECEEF2] text-xs font-mono-plex focus:outline-none focus:border-[#C9A227] transition"
              >
                {allDays.map((d) => (
                  <option key={d} value={d}>
                    {d === todayKey ? `${d} (Hoje)` : d}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Logs Panel */}
        <section className="bg-[#171C24] border border-[#2A3240] rounded-2xl p-5 sm:p-6 shadow-md flex flex-col h-full min-h-[380px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div>
              <h2 className="font-serif-fraunces font-semibold text-lg sm:text-xl text-[#ECEEF2] m-0">
                Histórico {isToday ? 'de hoje' : `de ${viewingKey}`}
              </h2>
              <p className="text-[#69707F] text-xs mt-0.5">
                {isToday
                  ? 'Transações gravadas de forma atômica no banco SQLite.'
                  : 'Registros salvos no banco de dados SQLite.'}
              </p>
            </div>

            {/* Log Search */}
            <div className="relative min-w-[200px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#69707F]" />
              <input
                type="text"
                placeholder="Filtrar por nome ou vaga…"
                value={logSearch}
                onChange={(e) => setLogSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-md border border-[#2A3240] bg-[#0B0D12] text-[#ECEEF2] placeholder-[#69707F] text-xs focus:outline-none focus:border-[#C9A227] transition"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[380px] custom-scrollbar border-t border-[#2A3240]/60 pt-2 divide-y divide-[#212936]">
            {filteredLog.length === 0 ? (
              <div className="py-12 text-center text-[#69707F] text-sm font-mono-plex">
                {logSearch
                  ? 'Nenhum sorteio encontrado com esse filtro.'
                  : isToday
                  ? 'Nenhum sorteio registrado ainda hoje no SQLite.'
                  : 'Nenhum registro para essa data.'}
              </div>
            ) : (
              filteredLog.map((entry) => (
                <div key={entry.id || entry.ts} className="py-3 px-1 flex gap-3.5 items-start hover:bg-[#1D2430]/40 rounded-lg transition-colors">
                  <div className="font-mono-plex text-xs text-[#69707F] whitespace-nowrap pt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-[#9AA3B3]" />
                    {entry.hora}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-[#ECEEF2] flex items-center justify-between">
                      <span>{entry.consultor}</span>
                      <span className="font-mono-plex text-[0.68rem] text-[#9AA3B3] bg-[#232B38] px-1.5 py-0.5 rounded border border-[#2A3240]">
                        {entry.vagas.length} vaga{entry.vagas.length > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="text-xs text-[#9AA3B3] mt-1 space-y-0.5">
                      {entry.vagas.map((v, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#C9A227]/80"></span>
                          <span className="truncate">{v}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      {/* Segments & Vacancies Grid */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="font-serif-fraunces font-semibold text-xl text-[#ECEEF2] m-0">
              Quadro de Vagas por Segmento
            </h2>
            <p className="text-xs text-[#69707F] mt-0.5">
              14 vagas distribuídas em Segurança, Serviços e Saúde
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
          {SEGMENTS.map((seg) => {
            const segVagas = pool.filter((v) => v.segmento === seg.key);
            const disponiveis = segVagas.filter((v) => v.status === 'disponivel').length;

            return (
              <div
                key={seg.key}
                className="bg-[#171C24] border border-[#2A3240] rounded-2xl p-4.5 flex flex-col gap-3 shadow"
              >
                {/* Segment Header */}
                <div className="flex items-center justify-between pb-2 border-b border-[#2A3240]/60">
                  <div className="font-serif-fraunces font-semibold text-base flex items-center gap-2 text-[#ECEEF2]">
                    <span
                      className="w-2.5 h-2.5 rounded-xs"
                      style={{ backgroundColor: seg.colorHex }}
                    />
                    <span>{seg.label}</span>
                  </div>
                  <span className="font-mono-plex text-xs font-semibold px-2 py-0.5 rounded bg-[#232B38] text-[#9AA3B3] border border-[#2A3240]">
                    {disponiveis} / {segVagas.length}
                  </span>
                </div>

                {/* Vacancy cards list */}
                <div className="space-y-2.5">
                  {segVagas.map((vaga) => {
                    const isAvailable = vaga.status === 'disponivel';

                    return (
                      <div
                        key={vaga.id}
                        style={{
                          borderLeftColor: isAvailable ? seg.colorHex : '#2A3240'
                        }}
                        className={`relative p-3 rounded-lg border border-[#2A3240] border-l-[3.5px] transition-all overflow-hidden ${
                          isAvailable
                            ? 'bg-[#1D2430] hover:border-[#3A4556]'
                            : 'bg-[#171C24] opacity-80'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono-plex text-[0.7rem] text-[#69707F] tracking-wider font-semibold">
                            {vaga.codigo}
                          </span>
                          {!isAvailable && (
                            <span className="stamp-badge">
                              Sorteada
                            </span>
                          )}
                        </div>

                        <div
                          className={`text-sm font-medium mt-1 leading-snug ${
                            isAvailable ? 'text-[#ECEEF2]' : 'text-[#9AA3B3]'
                          }`}
                        >
                          {vaga.nome}
                        </div>

                        {!isAvailable && (
                          <div className="mt-2 pt-2 border-t border-[#2A3240]/40 flex items-center justify-between text-[0.72rem] font-mono-plex text-[#69707F]">
                            <span className="text-[#9AA3B3] font-medium truncate max-w-[170px]">
                              {vaga.consultor}
                            </span>
                            <span>{vaga.hora}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-12 text-center text-[#69707F] text-xs font-mono-plex space-y-1">
        <div>Banco de Dados: SQLite / WASM · Fuso Oficial: América/São_Paulo (00h00)</div>
        <div className="text-[0.7rem] text-[#4E82C9]">
          Total de 14 vagas diárias auditáveis no servidor
        </div>
      </footer>

      {/* Modal: Reveal Result */}
      {revealModal.show && (
        <div
          className="fixed inset-0 bg-[#06080B]/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setRevealModal((prev) => ({ ...prev, show: false }))}
        >
          <div
            className="bg-[#171C24] border border-[#2A3240] rounded-2xl p-6 max-w-lg w-full shadow-2xl animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono-plex text-xs tracking-wider uppercase text-[#C9A227] font-semibold">
              Resultado do sorteio
            </div>
            <h3 className="font-serif-fraunces text-2xl font-semibold text-[#ECEEF2] mt-1 mb-4">
              Suas vagas de hoje
            </h3>

            {/* 3D Animated Reveal Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 my-4">
              {revealModal.vagas.map((vaga, idx) => {
                const seg = getSegmentMeta(vaga.segmento);
                const isFlipped = revealModal.flipped[idx] ?? true;

                return (
                  <div key={vaga.id} className="perspective-800 h-32">
                    <div
                      className={`relative w-full h-full transform-style-3d transition-transform duration-500 ${
                        isFlipped ? 'rotate-y-180' : ''
                      }`}
                    >
                      {/* Back face */}
                      <div className="absolute inset-0 rounded-xl bg-[#232B38] border border-dashed border-[#2A3240] backface-hidden flex flex-col items-center justify-center p-3 text-center">
                        <Sparkles className="w-5 h-5 text-[#C9A227] animate-pulse mb-1" />
                        <span className="font-mono-plex text-xs text-[#9AA3B3] uppercase tracking-wider">
                          Sorteando vaga {idx + 1}…
                        </span>
                      </div>

                      {/* Front face */}
                      <div
                        style={{ borderColor: seg.colorHex }}
                        className="absolute inset-0 rounded-xl bg-[#1D2430] border backface-hidden rotate-y-180 p-3.5 flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono-plex text-xs text-[#69707F] font-semibold">
                            {vaga.codigo}
                          </span>
                          <span
                            style={{ color: seg.colorHex }}
                            className="font-mono-plex text-[0.68rem] font-bold uppercase tracking-wider"
                          >
                            {seg.label}
                          </span>
                        </div>

                        <div className="font-serif-fraunces font-semibold text-base text-[#ECEEF2] leading-snug">
                          {vaga.nome}
                        </div>

                        <div className="text-[0.7rem] font-mono-plex text-[#3FA88C] flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Gravada no SQLite
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {revealModal.partial && (
              <div className="mt-3 p-3 rounded-lg bg-[#C9A227]/15 border border-[#C9A227]/30 text-[#E0BC3E] text-xs">
                Restava apenas 1 vaga disponível no pool de hoje — por isso você recebeu 1 vaga.
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setRevealModal((prev) => ({ ...prev, show: false }))}
                className="w-full py-2.5 px-4 font-semibold text-sm rounded-lg bg-gradient-to-b from-[#E0BC3E] to-[#C9A227] text-[#1A1305] hover:brightness-105 transition cursor-pointer"
              >
                Confirmar e Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Duplicate warning */}
      {dupModal.show && (
        <div
          className="fixed inset-0 bg-[#06080B]/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setDupModal({ show: false, name: '' })}
        >
          <div
            className="bg-[#171C24] border border-[#2A3240] rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono-plex text-xs tracking-wider uppercase text-[#C9A227] font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Atenção · Sorteio anterior encontrado
            </div>
            <h3 className="font-serif-fraunces text-xl font-semibold text-[#ECEEF2] mt-1 mb-3">
              Você já sorteou hoje
            </h3>
            <p className="text-sm text-[#9AA3B3] leading-relaxed">
              <strong className="text-[#ECEEF2]">{dupModal.name}</strong> já recebeu:{' '}
              <span className="text-[#E0BC3E]">
                {dupModal.lastLog?.vagas.join(' e ') || 'vagas anteriores'}
              </span>
              {dupModal.lastLog?.hora ? ` às ${dupModal.lastLog.hora}` : ''}.
            </p>
            <p className="text-xs text-[#69707F] mt-2">
              Deseja realizar mais um sorteio para esse mesmo consultor?
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setDupModal({ show: false, name: '' })}
                className="flex-1 py-2.5 px-3 rounded-lg border border-[#2A3240] text-sm text-[#9AA3B3] hover:text-[#ECEEF2] hover:bg-[#1D2430] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  const targetName = dupModal.name;
                  setDupModal({ show: false, name: '' });
                  executeDraw(targetName);
                }}
                className="flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm bg-gradient-to-b from-[#E0BC3E] to-[#C9A227] text-[#1A1305] hover:brightness-105 transition cursor-pointer"
              >
                Sortear mesmo assim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reset Confirmation */}
      {resetModal && (
        <div
          className="fixed inset-0 bg-[#06080B]/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setResetModal(false)}
        >
          <div
            className="bg-[#171C24] border border-[#2A3240] rounded-2xl p-6 max-w-md w-full shadow-2xl animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-mono-plex text-xs tracking-wider uppercase text-[#C1503F] font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" />
              Ação Irreversível
            </div>
            <h3 className="font-serif-fraunces text-xl font-semibold text-[#ECEEF2] mt-1 mb-3">
              Reiniciar sorteio de {viewingKey}?
            </h3>
            <p className="text-sm text-[#9AA3B3] leading-relaxed">
              Isso vai devolver todas as 14 vagas de <strong>{viewingKey}</strong> ao estado disponível no banco SQLite e limpar o histórico desse dia para toda a equipe.
            </p>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setResetModal(false)}
                className="flex-1 py-2.5 px-3 rounded-lg border border-[#2A3240] text-sm text-[#9AA3B3] hover:text-[#ECEEF2] hover:bg-[#1D2430] transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetDay}
                className="flex-1 py-2.5 px-3 rounded-lg font-semibold text-sm bg-[#C1503F] text-white hover:bg-[#A83E2F] transition cursor-pointer"
              >
                Confirmar e Reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Stats Modal */}
      {statsModal && (
        <div
          className="fixed inset-0 bg-[#06080B]/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setStatsModal(false)}
        >
          <div
            className="bg-[#171C24] border border-[#2A3240] rounded-2xl p-6 max-w-lg w-full shadow-2xl animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#2A3240]">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#C9A227]" />
                <h3 className="font-serif-fraunces text-xl font-semibold text-[#ECEEF2] m-0">
                  Estatísticas Consolidadas (SQLite)
                </h3>
              </div>
              <button
                onClick={() => setStatsModal(false)}
                className="text-[#9AA3B3] hover:text-[#ECEEF2] font-mono-plex"
              >
                ✕
              </button>
            </div>

            {statsLoading ? (
              <div className="py-12 text-center text-[#9AA3B3] font-mono-plex text-sm">
                Carregando dados agregados do SQLite…
              </div>
            ) : statsData ? (
              <div className="space-y-4 my-4">
                {/* Stats counter cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-[#1D2430] rounded-xl border border-[#2A3240] text-center">
                    <div className="text-2xl font-bold font-serif-fraunces text-[#C9A227]">
                      {statsData.totalDraws}
                    </div>
                    <div className="text-[0.7rem] font-mono-plex text-[#9AA3B3] uppercase">
                      Sorteios Realizados
                    </div>
                  </div>

                  <div className="p-3 bg-[#1D2430] rounded-xl border border-[#2A3240] text-center">
                    <div className="text-2xl font-bold font-serif-fraunces text-[#4E82C9]">
                      {statsData.totalDays}
                    </div>
                    <div className="text-[0.7rem] font-mono-plex text-[#9AA3B3] uppercase">
                      Dias Registrados
                    </div>
                  </div>

                  <div className="p-3 bg-[#1D2430] rounded-xl border border-[#2A3240] text-center">
                    <div className="text-2xl font-bold font-serif-fraunces text-[#3FA88C]">
                      {statsData.consultoresCount}
                    </div>
                    <div className="text-[0.7rem] font-mono-plex text-[#9AA3B3] uppercase">
                      Consultores Ativos
                    </div>
                  </div>
                </div>

                {/* Top Consultores */}
                {statsData.topConsultores.length > 0 && (
                  <div>
                    <h4 className="font-serif-fraunces text-sm font-semibold text-[#ECEEF2] mb-2">
                      Consultores com mais participações:
                    </h4>
                    <div className="space-y-1.5">
                      {statsData.topConsultores.map((c, i) => (
                        <div
                          key={c.name}
                          className="flex items-center justify-between text-xs p-2 bg-[#0B0D12] rounded-lg border border-[#2A3240]"
                        >
                          <span className="font-medium text-[#ECEEF2]">
                            {i + 1}. {c.name}
                          </span>
                          <span className="font-mono-plex text-[#C9A227]">
                            {c.count} sorteio{c.count > 1 ? 's' : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            <div className="pt-3 border-t border-[#2A3240] flex justify-end">
              <button
                onClick={() => setStatsModal(false)}
                className="py-2 px-4 rounded-lg bg-[#232B38] text-sm text-[#ECEEF2] hover:bg-[#2A3240] transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: SQLite Status Inspector */}
      {dbModal && (
        <div
          className="fixed inset-0 bg-[#06080B]/80 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setDbModal(false)}
        >
          <div
            className="bg-[#171C24] border border-[#2A3240] rounded-2xl p-6 max-w-lg w-full shadow-2xl animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-[#2A3240]">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-[#4E82C9]" />
                <h3 className="font-serif-fraunces text-xl font-semibold text-[#ECEEF2] m-0">
                  Estrutura & Persistência SQLite
                </h3>
              </div>
              <button
                onClick={() => setDbModal(false)}
                className="text-[#9AA3B3] hover:text-[#ECEEF2] font-mono-plex"
              >
                ✕
              </button>
            </div>

            <div className="my-4 space-y-3 text-xs text-[#9AA3B3] font-mono-plex leading-relaxed">
              <div className="p-3 bg-[#0B0D12] rounded-lg border border-[#2A3240]">
                <div className="text-[#3FA88C] font-semibold mb-1">✓ Motor SQLite WebAssembly (sql.js)</div>
                <div>Arquivo no disco: <span className="text-[#ECEEF2]">data/sorteio.sqlite</span></div>
                <div>Transações Atômicas: <span className="text-[#ECEEF2]">Sim (ORDER BY RANDOM() LIMIT 2)</span></div>
                <div>Fuso Horário: <span className="text-[#ECEEF2]">America/Sao_Paulo (Horário de Brasília)</span></div>
              </div>

              <div className="p-3 bg-[#0B0D12] rounded-lg border border-[#2A3240] space-y-1">
                <div className="text-[#C9A227] font-semibold">Tabelas Relacionais Ativas:</div>
                <div>• <strong className="text-[#ECEEF2]">days</strong> (date_key PK, created_at, updated_at)</div>
                <div>• <strong className="text-[#ECEEF2]">vacancies</strong> (id PK, date_key FK, codigo, nome, segmento, status, consultor, hora, ts, sort_order)</div>
                <div>• <strong className="text-[#ECEEF2]">draw_logs</strong> (id PK, date_key FK, consultor, vagas_json, hora, ts)</div>
              </div>
            </div>

            <div className="pt-3 border-t border-[#2A3240] flex justify-end">
              <button
                onClick={() => setDbModal(false)}
                className="py-2 px-4 rounded-lg bg-[#232B38] text-sm text-[#ECEEF2] hover:bg-[#2A3240] transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
