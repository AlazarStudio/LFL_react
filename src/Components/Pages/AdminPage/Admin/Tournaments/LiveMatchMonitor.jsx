// src/Components/Pages/AdminPage/Admin/Tournaments/LiveMatchMonitor.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useSearchParams } from 'react-router-dom';

import serverConfig from '../../../../../serverConfig';
import uploadsConfig from '../../../../../uploadsConfig';

import './LiveMatchMonitor.css';

// ===== API =====
const API_T = `${serverConfig}/tournaments`;
const API_TM = `${serverConfig}/tournament-matches`;

// ===== helpers =====
const SOCKET_URL = String(serverConfig || '').replace(/\/api\/?$/, '');
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');
const buildSrc = (p) =>
  !p ? '' : /^https?:\/\//i.test(p) ? p : `${ASSETS_BASE}${p}`;
const fmt2 = (n) => String(n).padStart(2, '0');
const dtRu = (v) => {
  try {
    const d = new Date(v);
    const dd = fmt2(d.getDate());
    const mm = fmt2(d.getMonth() + 1);
    const yyyy = d.getFullYear();
    const HH = fmt2(d.getHours());
    const MM = fmt2(d.getMinutes());
    return `${dd}.${mm}.${yyyy} ${HH}:${MM}`;
  } catch {
    return String(v || '');
  }
};

export default function LiveMatchMonitor() {
  const [sp, setSP] = useSearchParams();

  const initialMatchId =
    Number(sp.get('matchId') || localStorage.getItem('live:matchId') || 0) || 0;
  const initialTournamentId =
    sp.get('tId') || localStorage.getItem('live:tournamentId') || '';

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // выбор турнира/матча
  const [tournaments, setTournaments] = useState([]);
  const [tournamentId, setTournamentId] = useState(String(initialTournamentId));
  const [matches, setMatches] = useState([]);
  const [matchId, setMatchId] = useState(
    initialMatchId ? String(initialMatchId) : ''
  );
  const [directId, setDirectId] = useState('');

  // состояние матча
  const [match, setMatch] = useState(null);
  const [events, setEvents] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [referees, setReferees] = useState([]);

  const socketRef = useRef(null);
  const currentRoomRef = useRef(null);

  // часы
  const [clock, setClock] = useState(null);

  // локальный тикающий now
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ===== socket =====
  function ensureSocket() {
    if (socketRef.current) return socketRef.current;

    const s = io('https://backend.mlf09.ru', {
      path: '/socket.io',
      transports: ['websocket'],
      withCredentials: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = s;

    s.on('connect', () => {
      console.log('✅ socket connected', s.id);
      if (currentRoomRef.current) s.emit('room:join', currentRoomRef.current);
    });
    s.on('connect_error', (e) => console.log('❌ socket error', e?.message));

    s.onAny((event, ...args) => {
      if (!String(event).startsWith('pong')) {
        console.log('[live] ANY:', event, args?.[0]);
      }
    });

    // часы/ивенты/судьи
    s.on('tmatch:clock', (st) => setClock(st));
    s.on('tmatch:update', (patch) => {
      setMatch((m) =>
        m && patch && patch.id === m.id ? { ...m, ...patch } : m
      );
    });
    s.on('tmatch:status', ({ matchId, status }) => {
      setMatch((m) => (m && m.id === matchId ? { ...m, status } : m));
    });
    s.on('tmatch:score', ({ matchId, team1Score, team2Score }) => {
      setMatch((m) =>
        m && m.id === matchId ? { ...m, team1Score, team2Score } : m
      );
    });
    const sortEvents = (a, b) =>
      (a.half || 0) - (b.half || 0) ||
      (a.minute || 0) - (b.minute || 0) ||
      (a.id || 0) - (b.id || 0);
    s.on('tevent:created', (e) =>
      setEvents((arr) => [...arr, e].sort(sortEvents))
    );
    s.on('tevent:updated', (e) =>
      setEvents((arr) =>
        arr.map((x) => (x.id === e.id ? e : x)).sort(sortEvents)
      )
    );
    s.on('tevent:deleted', ({ id }) =>
      setEvents((arr) => arr.filter((x) => x.id !== id))
    );

    s.on('tparticipants:updated', (rows) => {
      if (Array.isArray(rows)) setParticipants(rows);
    });
    s.on('treferees:updated', (rows) => {
      if (Array.isArray(rows)) setReferees(rows);
    });

    return s;
  }

  function joinRoom(room) {
    if (!room) return;
    const s = ensureSocket();
    if (currentRoomRef.current && currentRoomRef.current !== room) {
      s.emit('room:leave', currentRoomRef.current);
    }
    s.emit('room:join', room);
    currentRoomRef.current = room;
  }

  function disconnectSocket() {
    try {
      const s = socketRef.current;
      if (s) {
        if (currentRoomRef.current)
          s.emit('room:leave', currentRoomRef.current);
        s.close();
      }
    } catch {}
    currentRoomRef.current = null;
    socketRef.current = null;
  }

  useEffect(() => () => disconnectSocket(), []);

  // ===== вычисление отображаемого времени =====
  const display = useMemo(() => {
    if (!clock) return { mm: '00', ss: '00', badge: '—', limit: '' };
    const {
      isPaused,
      startedAt,
      baseElapsedSec,
      addedSec = 0,
      phase,
      halfMinutes,
    } = clock;
    let elapsed = baseElapsedSec || 0;
    if (!isPaused && startedAt) {
      elapsed += Math.max(0, (now - startedAt) / 1000);
    }
    const total = Math.floor(elapsed + addedSec);
    const mm = String(Math.floor(total / 60)).padStart(2, '0');
    const ss = String(total % 60).padStart(2, '0');
    const phaseRu =
      {
        H1: '1 тайм',
        HT: 'Перерыв',
        H2: '2 тайм',
        ET1: 'ДВ-1',
        ET2: 'ДВ-2',
        FT: 'Матч окончен',
        PEN: 'Пенальти',
      }[phase] || phase;
    const badge = isPaused ? 'Пауза' : phaseRu;
    const limit = halfMinutes ? ` / ${halfMinutes}:00` : '';
    return { mm, ss, badge, limit };
  }, [clock, now]);

  // короткие геттеры
  const teamLeft = match?.team1TT?.team || null;
  const teamRight = match?.team2TT?.team || null;
  const ttTitle = (side) =>
    side === 1
      ? teamLeft?.title || `TT#${match?.team1TTId}`
      : teamRight?.title || `TT#${match?.team2TTId}`;
  const ttLogo = (side) =>
    side === 1
      ? buildSrc(teamLeft?.logo?.[0]?.src || teamLeft?.images?.[0])
      : buildSrc(teamRight?.logo?.[0]?.src || teamRight?.images?.[0]);
  const score1 = Number(match?.team1Score ?? 0);
  const score2 = Number(match?.team2Score ?? 0);

  // ===== загрузка =====
  async function loadTournaments() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 199]),
      sort: JSON.stringify(['startDate', 'DESC']),
      filter: JSON.stringify({}),
      include: 'teams',
    });
    const r = await fetch(`${API_T}?${params}`);
    const d = await r.json().catch(() => []);
    if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
    setTournaments(Array.isArray(d) ? d : []);
  }
  async function loadMatchesByTournament(tId) {
    if (!tId) return setMatches([]);
    const params = new URLSearchParams({
      range: JSON.stringify([0, 299]),
      sort: JSON.stringify(['date', 'ASC']),
      filter: JSON.stringify({}),
      include: 'team1,team2,stadium,referees',
    });
    const r = await fetch(`${API_T}/${tId}/matches?${params}`);
    const d = await r.json().catch(() => []);
    if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
    setMatches(Array.isArray(d) ? d : []);
  }
  async function loadMatchFull(id) {
    const r = await fetch(
      `${API_TM}/${id}?include=team1,team2,stadium,referees,events`
    );
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
    setMatch(d);
    setEvents(Array.isArray(d.events) ? d.events : []);
    setReferees(Array.isArray(d.referees) ? d.referees : []);
    // участники
    const rp = await fetch(`${API_TM}/${id}/participants`);
    const dp = await rp.json().catch(() => []);
    if (rp.ok && Array.isArray(dp)) setParticipants(dp);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await loadTournaments();
      } catch (e) {
        console.error(e);
        setErr('Не удалось загрузить турниры');
      } finally {
        setLoading(false);
      }
    })();
    // синхронизируем URL с восстановленными значениями
    setSP(
      (prev) => {
        const q = new URLSearchParams(prev);
        if (initialTournamentId) q.set('tId', String(initialTournamentId));
        if (initialMatchId) q.set('matchId', String(initialMatchId));
        return q;
      },
      { replace: true }
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tournamentId) return;
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await loadMatchesByTournament(tournamentId);
      } catch (e) {
        console.error(e);
        setErr('Не удалось загрузить матчи турнира');
      } finally {
        setLoading(false);
      }
    })();
  }, [tournamentId]);

  // автозагрузка матча при старте, если есть сохранённый
  useEffect(() => {
    if (initialMatchId) {
      setMatchId(String(initialMatchId));
      selectMatch(Number(initialMatchId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // выбор матча => загрузка + подписка на комнату + запрос часов
  async function selectMatch(id) {
    if (!id) return;
    try {
      setLoading(true);
      setErr('');
      await loadMatchFull(id);
      const s = ensureSocket();
      joinRoom(`tmatch:${id}`);
      s.emit('tmatch:clock:get', { matchId: id });

      // сохранить выбор
      setSP((prev) => {
        const q = new URLSearchParams(prev);
        q.set('matchId', String(id));
        if (tournamentId) q.set('tId', String(tournamentId));
        return q;
      });
      localStorage.setItem('live:matchId', String(id));
      if (tournamentId)
        localStorage.setItem('live:tournamentId', String(tournamentId));
    } catch (e) {
      console.error(e);
      setErr(`Не удалось загрузить матч #${id}`);
    } finally {
      setLoading(false);
    }
  }

  const sortEvents = (a, b) =>
    (a.half || 0) - (b.half || 0) ||
    (a.minute || 0) - (b.minute || 0) ||
    (a.id || 0) - (b.id || 0);

  // UI helpers
  const TYPE_LABEL = {
    GOAL: 'Гол',
    PENALTY_SCORED: 'Гол (пен.)',
    PENALTY_MISSED: 'Пенальти мимо',
    YELLOW_CARD: 'Жёлтая',
    RED_CARD: 'Красная',
    SUBSTITUTION: 'Замена',
  };
  const statusRu = (s) =>
    ({
      SCHEDULED: 'Запланирован',
      LIVE: 'Идёт',
      FINISHED: 'Завершён',
      POSTPONED: 'Перенесён',
      CANCELED: 'Отменён',
    }[s] || s);

  const playersL = useMemo(() => {
    const list = (participants || [])
      .filter(
        (p) => p?.tournamentTeamPlayer?.tournamentTeamId === match?.team1TTId
      )
      .map((p) => p.tournamentTeamPlayer?.player)
      .filter(Boolean);
    return list;
  }, [participants, match?.team1TTId]);

  const playersR = useMemo(() => {
    const list = (participants || [])
      .filter(
        (p) => p?.tournamentTeamPlayer?.tournamentTeamId === match?.team2TTId
      )
      .map((p) => p.tournamentTeamPlayer?.player)
      .filter(Boolean);
    return list;
  }, [participants, match?.team2TTId]);

  const playerLabel = (pl) =>
    pl ? `${pl.number != null ? `#${pl.number} ` : ''}${pl.name}` : '—';

  return (
    <div className="live-watch">
      <h1>Live наблюдение за матчем</h1>

      {err && <div className="alert alert--error">{err}</div>}
      {loading && <div className="alert">Загрузка…</div>}

      <section className="card" style={{ marginBottom: 12 }}>
        <div className="form">
          <div className="form__row">
            <label className="field">
              <span className="field__label">Турнир</span>
              <select
                className="input"
                value={tournamentId}
                onChange={(e) => {
                  const tid = e.target.value;
                  setTournamentId(tid);
                  setMatchId('');
                  setMatches([]);
                  setMatch(null);
                  setEvents([]);
                  setParticipants([]);
                  localStorage.setItem('live:tournamentId', tid || '');
                  localStorage.removeItem('live:matchId');
                  setSP((prev) => {
                    const q = new URLSearchParams(prev);
                    if (tid) q.set('tId', tid);
                    else q.delete('tId');
                    q.delete('matchId');
                    return q;
                  });
                }}
              >
                <option value="">— выберите —</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} {t.season ? `(${t.season})` : ''} — #{t.id}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field__label">Матч</span>
              <select
                className="input"
                value={matchId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  setMatchId(String(id || ''));
                  if (id) selectMatch(id);
                }}
                disabled={!tournamentId}
              >
                <option value="">— выберите —</option>
                {matches.map((m) => (
                  <option key={m.id} value={m.id}>
                    #{m.id} • {m.team1TT?.team?.title || `TT#${m.team1TTId}`} —{' '}
                    {m.team2TT?.team?.title || `TT#${m.team2TTId}`} •{' '}
                    {dtRu(m.date)}
                  </option>
                ))}
              </select>
            </label>

            <div className="field">
              <span className="field__label">Или быстро по ID</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  type="number"
                  placeholder="matchId"
                  value={directId}
                  onChange={(e) => setDirectId(e.target.value)}
                  style={{ width: 140 }}
                />
                <button
                  className="btn"
                  onClick={() => {
                    const id = Number(directId);
                    if (!id) return;
                    selectMatch(id);
                  }}
                >
                  Открыть
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!match ? (
        <div className="muted">Выберите матч.</div>
      ) : (
        <>
          <section className="card scoreboard">
            <div className="score__timer">
              <span
                className={`badge ${clock?.isPaused ? 'badge--paused' : ''}`}
              >
                {display.badge}
              </span>
              <span
                style={{ marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}
              >
                {display.mm}:{display.ss}
                {display.limit}
              </span>
              {clock?.addedSec ? (
                <span className="muted" style={{ marginLeft: 6 }}>
                  +{Math.floor(clock.addedSec / 60)}
                </span>
              ) : null}
            </div>
            <div className="scoreboard__row">
              <div className="team">
                <img className="team__logo" src={ttLogo(1)} alt="" />
                <div className="team__name">{ttTitle(1)}</div>
              </div>
              <div className="score">
                <div className="score__value">
                  <b>{score1}</b> : <b>{score2}</b>
                </div>
                <div className="score__meta">
                  <span
                    className={`badge badge--${(
                      match.status || ''
                    ).toLowerCase()}`}
                  >
                    {statusRu(match.status)}
                  </span>
                  <span className="muted" style={{ marginLeft: 8 }}>
                    {dtRu(match.date)}
                  </span>
                </div>
              </div>
              <div className="team team--right">
                <div className="team__name">{ttTitle(2)}</div>
                <img className="team__logo" src={ttLogo(2)} alt="" />
              </div>
            </div>
          </section>

          <section className="card">
            <div className="timeline__hdr">
              <h3>Хронология событий</h3>
            </div>
            {events.length === 0 ? (
              <div className="muted">Событий пока нет</div>
            ) : (
              <div className="table">
                <div className="table__head">
                  <div style={{ width: 60 }}>Тайм</div>
                  <div style={{ width: 70 }}>Минута</div>
                  <div style={{ width: 160 }}>Событие</div>
                  <div style={{ minWidth: 180 }}>Команда</div>
                  <div style={{ minWidth: 200 }}>Игрок</div>
                  <div style={{ minWidth: 200 }}>Ассистент</div>
                </div>
                <div className="table__body">
                  {[...events].sort(sortEvents).map((e) => (
                    <div className="table__row" key={e.id}>
                      <div>{e.half}</div>
                      <div>{e.minute}'</div>
                      <div>{TYPE_LABEL[e.type] || e.type}</div>
                      <div>
                        {e?.tournamentTeam?.team?.title ||
                          (e.tournamentTeamId === match.team1TTId
                            ? ttTitle(1)
                            : ttTitle(2))}
                      </div>
                      <div>
                        {e?.rosterItem?.player
                          ? playerLabel(e.rosterItem.player)
                          : '—'}
                      </div>
                      <div>
                        {e?.assistRosterItem?.player
                          ? playerLabel(e.assistRosterItem.player)
                          : '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="card twocol">
            <div>
              <h3>Участники (левые)</h3>
              {playersL.length === 0 ? (
                <div className="muted">Нет данных</div>
              ) : (
                <ul className="plain">
                  {playersL.map((p) => (
                    <li key={p.id}>{playerLabel(p)}</li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>Участники (правые)</h3>
              {playersR.length === 0 ? (
                <div className="muted">Нет данных</div>
              ) : (
                <ul className="plain">
                  {playersR.map((p) => (
                    <li key={p.id}>{playerLabel(p)}</li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="card">
            <h3>Судьи</h3>
            {!referees || referees.length === 0 ? (
              <div className="muted">Не назначены</div>
            ) : (
              <ul className="plain">
                {referees.map((r) => (
                  <li key={`${r.refereeId || r.id}-${r.role || ''}`}>
                    {r?.referee?.name || r?.name || `#${r.refereeId || r.id}`}{' '}
                    <span className="muted">{r.role ? `(${r.role})` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
