// src/Components/Pages/AdminPage/Admin/Tournaments/Tabs/TournamentMatchesTab.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import serverConfig from '../../../../../../serverConfig';
import './TournamentMatchesTab.css';

/* ===================== API ===================== */
const API_T = `${serverConfig}/tournaments`;
const API_REFS = `${serverConfig}/referees`;
const API_STADIUMS = `${serverConfig}/stadiums`;

/* ===================== Утилиты ===================== */
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const fmt2 = (n) => String(n).padStart(2, '0');
const dtLoc = (s) => {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return String(s || '');
  }
};
const escapeHtml = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/* ===================== Модалка: Провести турнирный матч ===================== */
function LiveTMatchModal({ match, ttIndex, onClose, onScoreChanged }) {
  // match: { id, date, status, team1TTId, team2TTId, team1Score, team2Score, ... }
  // ttIndex: Map<TT.id, { team, roster, rosterIndexByPlayerId }>

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Параметры турнира
  const [halfMinutes, setHalfMinutes] = useState(45);
  const [halves, setHalves] = useState(2);

  // Судьи
  const [referees, setReferees] = useState([]);
  const refereeIndex = useMemo(() => {
    const m = new Map();
    (referees || []).forEach((r) => r?.id && m.set(r.id, r));
    return m;
  }, [referees]);
  const refNameById = (id) =>
    refereeIndex.get(Number(id))?.name || (id ? `#${id}` : '');

  // Участники (опубликованные на матч) — TournamentPlayerMatch -> TournamentTeamPlayer -> player
  const [participants, setParticipants] = useState([]); // сырые rows
  const [lineup1, setLineup1] = useState([]); // Player[]
  const [lineup2, setLineup2] = useState([]); // Player[]
  const [lineupFallback, setLineupFallback] = useState(false); // если lineup пуст — берём из заявки

  // События
  const [events, setEvents] = useState([]);

  // Счёт/статус
  const [score1, setScore1] = useState(match.team1Score ?? 0);
  const [score2, setScore2] = useState(match.team2Score ?? 0);
  const [status, setStatus] = useState(match.status || 'SCHEDULED');

  // Тайм/таймер
  const [currentHalf, setCurrentHalf] = useState(1);
  const [running, setRunning] = useState(false);
  const [halfStartTS, setHalfStartTS] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef(null);

  // Формы создания событий по сторонам (выбор игрока по playerId, но пошлём rosterItemId)
  const initialEvt = {
    type: '',
    playerId: '',
    assistPlayerId: '',
    refereeId: '',
    minute: '',
    description: '',
  };
  const [evt1, setEvt1] = useState({ ...initialEvt });
  const [evt2, setEvt2] = useState({ ...initialEvt });

  // Редактирование события
  const [editEventId, setEditEventId] = useState(null);
  const [editDraft, setEditDraft] = useState({
    type: '',
    half: 1,
    minute: '',
    playerId: '',
    assistPlayerId: '',
    refereeId: '',
    description: '',
    _tournamentTeamId: null, // для выбора списка игроков
  });

  /* ---------- Константы типов ---------- */
  const QUICK_TYPES = [
    { key: 'GOAL', label: 'Гол', icon: '⚽' },
    { key: 'PENALTY_SCORED', label: 'Гол (пен.)', icon: '🥅' },
    { key: 'PENALTY_MISSED', label: 'Пенальти мимо', icon: '🚫' },
    { key: 'YELLOW_CARD', label: 'Жёлтая', icon: '🟨' },
    { key: 'RED_CARD', label: 'Красная', icon: '🟥' },
  ];
  const ALL_TYPES = [
    'GOAL',
    'PENALTY_SCORED',
    'PENALTY_MISSED',
    'YELLOW_CARD',
    'RED_CARD',
    'SUBSTITUTION',
  ];
  const TYPE_LABEL = {
    GOAL: 'Гол (с игры)',
    PENALTY_SCORED: 'Гол (пенальти)',
    PENALTY_MISSED: 'Пенальти не забит',
    YELLOW_CARD: 'Жёлтая карточка',
    RED_CARD: 'Красная карточка',
    SUBSTITUTION: 'Замена',
  };
  const STATUS_RU = {
    SCHEDULED: 'Запланирован',
    LIVE: 'Идёт',
    FINISHED: 'Завершён',
    POSTPONED: 'Перенесён',
    CANCELED: 'Отменён',
  };
  const statusRu = (s) => STATUS_RU[s] || s || '';

  /* ---------- Загрузка данных ---------- */
  async function loadTournament() {
    // для halfMinutes/halves
    const res = await fetch(`${API_T}/${match.tournamentId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setHalfMinutes(data?.halfMinutes ?? 45);
    setHalves(data?.halves ?? 2);
  }
  async function loadRefs() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 199]),
      sort: JSON.stringify(['name', 'ASC']),
      filter: JSON.stringify({}),
    });
    const res = await fetch(`${API_REFS}?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setReferees(Array.isArray(data) ? data : []);
  }
  async function loadParticipants() {
    const res = await fetch(
      `${serverConfig}/tournament-matches/${match.id}/participants`
    );
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setParticipants(Array.isArray(data) ? data : []);

    const t1 = [];
    const t2 = [];
    for (const pm of data || []) {
      const p = pm?.tournamentTeamPlayer?.player;
      const ttId = pm?.tournamentTeamPlayer?.tournamentTeamId;
      if (p && ttId === match.team1TTId) t1.push(p);
      if (p && ttId === match.team2TTId) t2.push(p);
    }
    if (t1.length || t2.length) {
      setLineup1(t1);
      setLineup2(t2);
      setLineupFallback(false);
    } else {
      // возьмём из заявки команд
      const left =
        ttIndex.get(match.team1TTId)?.roster?.map((r) => r.player) || [];
      const right =
        ttIndex.get(match.team2TTId)?.roster?.map((r) => r.player) || [];
      setLineup1(left);
      setLineup2(right);
      setLineupFallback(true);
    }
  }
  async function loadEvents() {
    const res = await fetch(
      `${serverConfig}/tournament-matches/${match.id}/events`
    );
    const data = await res.json().catch(() => []);
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setEvents(Array.isArray(data) ? data : []);
    // пересчёт счёта
    const { s1, s2 } = calcScoreFromEvents(Array.isArray(data) ? data : []);
    setScore1(s1);
    setScore2(s2);
    onScoreChanged?.(match.id, { team1Score: s1, team2Score: s2 });
  }

  const calcScoreFromEvents = (list) => {
    const goals = new Map(); // tournamentTeamId -> count
    (list || []).forEach((e) => {
      if (e.type === 'GOAL' || e.type === 'PENALTY_SCORED') {
        goals.set(e.tournamentTeamId, (goals.get(e.tournamentTeamId) || 0) + 1);
      }
    });
    return {
      s1: goals.get(match.team1TTId) || 0,
      s2: goals.get(match.team2TTId) || 0,
    };
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await Promise.all([
          loadTournament(),
          loadRefs(),
          loadParticipants(),
          loadEvents(),
        ]);
        setStatus(match.status || 'SCHEDULED');
      } catch (e) {
        console.error(e);
        setErr(e.message || 'Ошибка загрузки данных матча');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  /* ---------- Таймер ---------- */
  useEffect(() => {
    if (!running) {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return;
    }
    if (!halfStartTS) setHalfStartTS(Date.now());
    tickRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (halfStartTS ?? Date.now())) / 1000));
    }, 1000);
    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [running, halfStartTS]);

  const halfMinuteNow = useMemo(() => {
    const m = Math.floor(elapsed / 60) + 1;
    return clamp(m, 1, Number(halfMinutes) || 45);
  }, [elapsed, halfMinutes]);
  const mm = fmt2(Math.floor(elapsed / 60));
  const ss = fmt2(elapsed % 60);

  function startPause() {
    if (running) setRunning(false);
    else {
      setHalfStartTS(Date.now() - elapsed * 1000);
      setRunning(true);
    }
  }
  function finishHalf() {
    setRunning(false);
    setElapsed(0);
    setHalfStartTS(null);
  }
  function nextHalf() {
    finishHalf();
    setCurrentHalf((h) => clamp(h + 1, 1, halves));
  }
  function prevHalf() {
    finishHalf();
    setCurrentHalf((h) => clamp(h - 1, 1, halves));
  }

  /* ---------- Индексы заявок/участников ---------- */
  // Для конвертации playerId -> rosterItemId
  const rosterIndex1 =
    ttIndex.get(match.team1TTId)?.rosterIndexByPlayerId || new Map();
  const rosterIndex2 =
    ttIndex.get(match.team2TTId)?.rosterIndexByPlayerId || new Map();

  const ttTitle = (ttId) => ttIndex.get(ttId)?.team?.title || `#${ttId}`;
  const teamLeft = ttIndex.get(match.team1TTId)?.team;
  const teamRight = ttIndex.get(match.team2TTId)?.team;

  const playerLabel = (p) =>
    p ? `${p.number != null ? `#${p.number} ` : ''}${p.name}` : '';

  /* ---------- Когда показывать игрока/ассистента/судью ---------- */
  const showPlayerForType = (t) =>
    [
      'GOAL',
      'PENALTY_SCORED',
      'PENALTY_MISSED',
      'YELLOW_CARD',
      'RED_CARD',
    ].includes(t);
  const showAssistForType = (t) => t === 'GOAL';
  const showRefForType = (t) => t === 'YELLOW_CARD' || t === 'RED_CARD';

  /* ---------- Отправка события ---------- */
  async function submitEvent(side, form) {
    try {
      setLoading(true);
      setErr('');
      if (!form.type) throw new Error('Выберите тип события');

      const ttId = side === 1 ? match.team1TTId : match.team2TTId;
      const minuteToSend = Number(form.minute) || halfMinuteNow;

      // Конвертируем playerId -> rosterItemId (если нет — шлём null)
      const rIndex = side === 1 ? rosterIndex1 : rosterIndex2;
      const rosterItemId = form.playerId
        ? Number(rIndex.get(Number(form.playerId)) || null)
        : null;
      const assistRosterItemId = form.assistPlayerId
        ? Number(rIndex.get(Number(form.assistPlayerId)) || null)
        : null;

      const refId = form.refereeId ? Number(form.refereeId) : null;

      const payload = {
        minute: minuteToSend,
        half: currentHalf,
        type: form.type,
        description: form.description || null,
        tournamentTeamId: ttId,
        rosterItemId,
        assistRosterItemId,
        issuedByRefereeId: refId, // бэкенд-поле
        refereeId: refId, // на случай, если вы примете это имя
        issued_by_referee_id: refId, // на всякий
      };

      const res = await fetch(
        `${serverConfig}/tournament-matches/${match.id}/events`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      await loadEvents();
      if (side === 1) setEvt1({ ...initialEvt, minute: '' });
      else setEvt2({ ...initialEvt, minute: '' });
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось сохранить событие');
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Редактирование события ---------- */
  function startEditEvent(e) {
    const pMain = e?.rosterItem?.player;
    const pAst = e?.assistRosterItem?.player;
    setEditEventId(e.id);
    setEditDraft({
      type: e.type || 'GOAL',
      half: e.half ?? 1,
      minute: e.minute ?? '',
      playerId: pMain?.id ?? '',
      assistPlayerId: pAst?.id ?? '',
      refereeId:
        e.issuedByRefereeId ?? e.refereeId ?? e.issued_by_referee_id ?? '',
      description: e.description || '',
      _tournamentTeamId: e.tournamentTeamId,
    });
  }
  function cancelEditEvent() {
    setEditEventId(null);
    setEditDraft({
      type: '',
      half: 1,
      minute: '',
      playerId: '',
      assistPlayerId: '',
      refereeId: '',
      description: '',
      _tournamentTeamId: null,
    });
  }
  async function saveEditEvent() {
    if (!editEventId) return;
    try {
      setLoading(true);
      setErr('');

      // Подберём нужный rosterIndex для команды события
      const rIndex =
        editDraft._tournamentTeamId === match.team1TTId
          ? rosterIndex1
          : rosterIndex2;

      const rosterItemId = editDraft.playerId
        ? Number(rIndex.get(Number(editDraft.playerId)) || null)
        : null;
      const assistRosterItemId = editDraft.assistPlayerId
        ? Number(rIndex.get(Number(editDraft.assistPlayerId)) || null)
        : null;

      const refId = editDraft.refereeId ? Number(editDraft.refereeId) : null;

      const payload = {
        type: editDraft.type,
        half: Number(editDraft.half) || 1,
        minute: Number(editDraft.minute) || 1,
        description: editDraft.description || null,
        rosterItemId,
        assistRosterItemId,
        tournamentTeamId: editDraft._tournamentTeamId,
        issuedByRefereeId: refId,
        refereeId: refId,
        issued_by_referee_id: refId,
      };

      const res = await fetch(
        `${serverConfig}/tournament-events/${editEventId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      cancelEditEvent();
      await loadEvents();
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось сохранить изменения события');
    } finally {
      setLoading(false);
    }
  }
  async function deleteEvent(id) {
    if (!window.confirm('Удалить событие?')) return;
    try {
      setLoading(true);
      setErr('');
      const res = await fetch(`${serverConfig}/tournament-events/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      if (editEventId === id) cancelEditEvent();
      await loadEvents();
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось удалить событие');
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Завершение матча ---------- */
  async function finishMatch() {
    try {
      if (!window.confirm('Завершить матч и пересчитать пару?')) return;
      setLoading(true);
      setErr('');
      setRunning(false);
      const res = await fetch(
        `${serverConfig}/tournament-matches/${match.id}/finish`,
        { method: 'POST' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setStatus('FINISHED');
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось завершить матч');
    } finally {
      setLoading(false);
    }
  }

  /* ---------- MVP (простой подсчёт как в лиге) ---------- */
  const mvpStats = useMemo(() => {
    const map = new Map(); // playerId -> stats
    const inc = (pid, key, ttId) => {
      if (!pid) return;
      const row = map.get(pid) || {
        goals: 0,
        pens: 0,
        assists: 0,
        yc: 0,
        rc: 0,
        pmissed: 0,
        ttId,
      };
      row[key] = (row[key] || 0) + 1;
      if (!row.ttId && ttId) row.ttId = ttId;
      map.set(pid, row);
    };
    events.forEach((e) => {
      const main = e?.rosterItem?.player?.id ?? null;
      const ast = e?.assistRosterItem?.player?.id ?? null;
      if (e.type === 'GOAL') inc(main, 'goals', e.tournamentTeamId);
      if (e.type === 'PENALTY_SCORED') inc(main, 'pens', e.tournamentTeamId);
      if (e.type === 'PENALTY_MISSED') inc(main, 'pmissed', e.tournamentTeamId);
      if (e.type === 'YELLOW_CARD') inc(main, 'yc', e.tournamentTeamId);
      if (e.type === 'RED_CARD') inc(main, 'rc', e.tournamentTeamId);
      if (ast) inc(ast, 'assists', e.tournamentTeamId);
    });
    const winner =
      score1 > score2
        ? match.team1TTId
        : score2 > score1
        ? match.team2TTId
        : null;

    const rows = [...map.entries()].map(([playerId, r]) => {
      let score =
        r.goals * 3 +
        r.pens * 2 +
        r.assists * 2 -
        r.yc * 1 -
        r.rc * 3 -
        r.pmissed * 2;
      if (winner && r.ttId === winner && r.goals + r.pens + r.assists > 0) {
        score += 1;
      }
      // имя/номер из lineup1/2 или заявки
      const pl =
        lineup1.concat(lineup2).find((x) => x.id === Number(playerId)) ||
        ttIndex
          .get(match.team1TTId)
          ?.roster?.map((r) => r.player)
          .find((x) => x.id === Number(playerId)) ||
        ttIndex
          .get(match.team2TTId)
          ?.roster?.map((r) => r.player)
          .find((x) => x.id === Number(playerId));
      return {
        playerId: Number(playerId),
        name: pl ? playerLabel(pl) : `#${playerId}`,
        score,
        goals: r.goals + r.pens,
        assists: r.assists,
        yc: r.yc,
        rc: r.rc,
        ttId: r.ttId,
      };
    });

    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      if (a.rc !== b.rc) return a.rc - b.rc;
      if (a.yc !== b.yc) return a.yc - b.yc;
      return a.playerId - b.playerId;
    });

    return { best: rows[0] || null, top: rows.slice(0, 5) };
  }, [
    events,
    score1,
    score2,
    lineup1,
    lineup2,
    ttIndex,
    match.team1TTId,
    match.team2TTId,
  ]);
  const [showMvp, setShowMvp] = useState(false);

  /* ---------- Центр. таблички/помощники ---------- */
  const SidePanel = ({ side }) => {
    const isHome = side === 1;
    const ttId = isHome ? match.team1TTId : match.team2TTId;
    const teamTitle = ttTitle(ttId);

    const players = (isHome ? lineup1 : lineup2)?.length
      ? isHome
        ? lineup1
        : lineup2
      : (ttIndex.get(ttId)?.roster || []).map((r) => r.player);

    const form = isHome ? evt1 : evt2;
    const setForm = isHome ? setEvt1 : setEvt2;

    const showPlayer = showPlayerForType(form.type);
    const showAssist = showAssistForType(form.type);
    const showRef = showRefForType(form.type);

    return (
      <div
        className={`event-panel ${
          isHome ? 'event-panel--home' : 'event-panel--away'
        }`}
      >
        <div className="event-panel__team">
          {teamTitle}
          {lineupFallback && (
            <span className="muted fallback-note">
              (состав на матч не опубликован)
            </span>
          )}
        </div>

        <div className="event-types">
          {QUICK_TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setForm((s) => ({ ...s, type: t.key }))}
              className={`event-type ${form.type === t.key ? 'is-active' : ''}`}
            >
              <span className="event-type__icon" aria-hidden>
                {t.icon}
              </span>
              <span className="event-type__label">{t.label}</span>
            </button>
          ))}
        </div>

        <div className="card event-form">
          {!form.type ? (
            <div className="event-form__empty">Выберите тип события сверху</div>
          ) : (
            <div className="event-form__inner">
              <div className="form__row">
                {showPlayer && (
                  <label className="field">
                    <span className="field__label">
                      Игрок
                      {form.type === 'YELLOW_CARD' || form.type === 'RED_CARD'
                        ? ' (получил)'
                        : ''}
                    </span>
                    <select
                      className="input"
                      value={form.playerId}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, playerId: e.target.value }))
                      }
                    >
                      <option value="">—</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.number ? `#${p.number} ` : ''}
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {showAssist && (
                  <label className="field">
                    <span className="field__label">Ассистент</span>
                    <select
                      className="input"
                      value={form.assistPlayerId}
                      onChange={(e) =>
                        setForm((s) => ({
                          ...s,
                          assistPlayerId: e.target.value,
                        }))
                      }
                    >
                      <option value="">—</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.number ? `#${p.number} ` : ''}
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                {showRef && (
                  <label className="field">
                    <span className="field__label">Судья</span>
                    <select
                      className="input"
                      value={form.refereeId}
                      onChange={(e) =>
                        setForm((s) => ({ ...s, refereeId: e.target.value }))
                      }
                    >
                      <option value="">—</option>
                      {referees.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="form__row">
                <label className="field field--minute">
                  <span className="field__label">Минута</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={Number(halfMinutes) || 45}
                    value={form.minute || halfMinuteNow}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, minute: e.target.value }))
                    }
                  />
                </label>

                <label className="field field--grow">
                  <span className="field__label">Комментарий (опц.)</span>
                  <input
                    className="input"
                    value={form.description}
                    onChange={(e) =>
                      setForm((s) => ({ ...s, description: e.target.value }))
                    }
                    placeholder="например: удар в дальний"
                  />
                </label>

                <div className="form__actions event-form__actions">
                  <button
                    className="btn btn--primary"
                    disabled={
                      loading ||
                      !form.type ||
                      (showPlayer && !form.playerId) ||
                      (showRef && !form.refereeId)
                    }
                    onClick={() => submitEvent(side, form)}
                  >
                    Записать событие
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ---------- Протокол DOCX (необяз.) ---------- */
  async function downloadReportDocx() {
    try {
      setLoading(true);
      const docx = await import('docx');
      const {
        Document,
        Packer,
        Paragraph,
        TextRun,
        Table,
        TableRow,
        TableCell,
        WidthType,
        HeadingLevel,
        AlignmentType,
        BorderStyle,
      } = docx;

      const t1 = ttTitle(match.team1TTId);
      const t2 = ttTitle(match.team2TTId);

      const H = (text, level = HeadingLevel.HEADING_2) =>
        new Paragraph({ text, heading: level });
      const P = (text, opts = {}) =>
        new Paragraph({ children: [new TextRun(String(text || ''))], ...opts });

      const makeTable = (headCells, rows) => {
        const head = new TableRow({
          children: headCells.map((c) => new TableCell({ children: [P(c)] })),
        });
        const body = rows.map(
          (r) =>
            new TableRow({
              children: r.map((c) => new TableCell({ children: [P(c)] })),
            })
        );
        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [head, ...body],
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
            insideHorizontal: {
              style: BorderStyle.SINGLE,
              size: 1,
              color: 'DDDDDD',
            },
            insideVertical: {
              style: BorderStyle.SINGLE,
              size: 1,
              color: 'DDDDDD',
            },
          },
        });
      };

      const scorePara = new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun(`${t1} — ${t2}: `),
          new TextRun({ text: String(Number(score1)), bold: true }),
          new TextRun(':'),
          new TextRun({ text: String(Number(score2)), bold: true }),
        ],
      });

      const eventRows = (events || []).map((e) => [
        String(e.half ?? ''),
        `${e.minute ?? ''}'`,
        TYPE_LABEL[e.type] || e.type,
        e?.rosterItem?.player ? playerLabel(e.rosterItem.player) : '—',
        e?.assistRosterItem?.player
          ? playerLabel(e.assistRosterItem.player)
          : '—',
        refNameById(
          e.issuedByRefereeId ?? e.refereeId ?? e.issued_by_referee_id
        ) || '—',
        ttTitle(e.tournamentTeamId),
        e.description || '',
      ]);

      const listOrFallback = (line, ttId) =>
        line && line.length
          ? line
          : (ttIndex.get(ttId)?.roster || []).map((r) => r.player);
      const lineupRows1 = listOrFallback(lineup1, match.team1TTId).map((p) => [
        String(p.number ?? ''),
        p.name || '',
      ]);
      const lineupRows2 = listOrFallback(lineup2, match.team2TTId).map((p) => [
        String(p.number ?? ''),
        p.name || '',
      ]);

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: { top: 720, right: 720, bottom: 720, left: 720 },
              },
            },
            children: [
              H(`Протокол матча №${match.id}`, HeadingLevel.HEADING_1),
              P(`${t1} — ${t2}`),
              P(`Дата: ${dtLoc(match.date)} • Статус: ${statusRu(status)}`),
              H('Счёт'),
              scorePara,
              H('События'),
              makeTable(
                [
                  'Тайм',
                  'Минута',
                  'Тип',
                  'Игрок',
                  'Ассистент',
                  'Судья',
                  'Команда',
                  'Комментарий',
                ],
                eventRows.length
                  ? eventRows
                  : [['—', '—', 'Событий нет', '—', '—', '—', '—', '—']]
              ),
              H('Составы команд'),
              H(`${t1} — состав`, HeadingLevel.HEADING_3),
              makeTable(
                ['№', 'Игрок'],
                lineupRows1.length ? lineupRows1 : [['—', '—']]
              ),
              ...(lineup1 && lineup1.length
                ? []
                : [
                    P(
                      'Примечание: официальный состав не опубликован. Показана заявка команды.'
                    ),
                  ]),
              H(`${t2} — состав`, HeadingLevel.HEADING_3),
              makeTable(
                ['№', 'Игрок'],
                lineupRows2.length ? lineupRows2 : [['—', '—']]
              ),
              ...(lineup2 && lineup2.length
                ? []
                : [
                    P(
                      'Примечание: официальный состав не опубликован. Показана заявка команды.'
                    ),
                  ]),
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tmatch_${match.id}_protocol.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert(
        'Не удалось сформировать DOCX. Убедитесь, что установлен пакет "docx".'
      );
    } finally {
      setLoading(false);
    }
  }

  /* ---------- Разметка модалки ---------- */
  return (
    <div className="modal live-modal">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__dialog live-modal__dialog">
        <div className="modal__header">
          <h3 className="modal__title">
            Проведение матча: {ttTitle(match.team1TTId)} —{' '}
            {ttTitle(match.team2TTId)}
          </h3>
          <button className="btn btn--ghost" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal__body">
          {err && <div className="alert alert--error">{err}</div>}
          {loading && <div className="alert">Загрузка…</div>}

          <div className="live-threecol">
            <SidePanel side={1} />

            <section className="card scoreboard">
              <div className="scoreboard__teams">
                <div className="scoreboard__team scoreboard__team--left">
                  {teamLeft?.title || ttTitle(match.team1TTId)}
                </div>
                <div className="scoreboard__team scoreboard__team--right">
                  {teamRight?.title || ttTitle(match.team2TTId)}
                </div>
              </div>

              <div className="scoreboard__score">
                {score1}
                <span>:</span>
                {score2}
              </div>

              <div className="scoreboard__top">
                <div>
                  Время:{' '}
                  <b>
                    {mm}:{ss}
                  </b>
                </div>
                <div>
                  Тайм: <b>{currentHalf}</b> / {halves}
                </div>
              </div>

              <div className="scoreboard__controls">
                <button className="btn btn--ghost" onClick={startPause}>
                  {running ? 'Пауза' : 'Старт'}
                </button>
                <button className="btn" onClick={finishHalf}>
                  Завершить тайм
                </button>
                <div className="scoreboard__nav">
                  <button
                    className="btn btn--ghost"
                    onClick={prevHalf}
                    disabled={currentHalf <= 1}
                  >
                    ← Пред. тайм
                  </button>
                  <button
                    className="btn btn--ghost"
                    onClick={nextHalf}
                    disabled={currentHalf >= halves}
                  >
                    След. тайм →
                  </button>
                </div>
              </div>

              {status === 'FINISHED' && (
                <div className="scoreboard__downloads">
                  <button className="btn btn--sm" onClick={downloadReportDocx}>
                    Скачать DOCX
                  </button>
                </div>
              )}
            </section>

            <SidePanel side={2} />
          </div>

          <section className="card timeline">
            <div className="timeline__hdr">
              <h4 className="timeline__title">Хронология событий</h4>
              {status === 'FINISHED' && (
                <div className="row-actions">
                  <button className="btn btn--sm" onClick={downloadReportDocx}>
                    Скачать DOCX
                  </button>
                </div>
              )}
            </div>

            {events.length === 0 && (
              <div className="muted">Событий пока нет</div>
            )}

            {events.length > 0 && (
              <div className="table">
                <div className="table__head">
                  <div style={{ width: 60 }}>Тайм</div>
                  <div style={{ width: 70 }}>Минута</div>
                  <div style={{ width: 160 }}>Событие</div>
                  <div style={{ minWidth: 180 }}>Команда</div>
                  <div style={{ minWidth: 200 }}>Игрок</div>
                  <div style={{ minWidth: 200 }}>Ассистент</div>
                  <div style={{ minWidth: 160 }}>Судья</div>
                  <div style={{ width: 160 }}>Действия</div>
                </div>
                <div className="table__body">
                  {events.map((e) => {
                    const isEdit = editEventId === e.id;
                    const playersForTeam =
                      (e.tournamentTeamId === match.team1TTId
                        ? lineup1?.length
                          ? lineup1
                          : (ttIndex.get(match.team1TTId)?.roster || []).map(
                              (r) => r.player
                            )
                        : lineup2?.length
                        ? lineup2
                        : (ttIndex.get(match.team2TTId)?.roster || []).map(
                            (r) => r.player
                          )) || [];
                    const showPlayer = showPlayerForType(
                      isEdit ? editDraft.type : e.type
                    );
                    const showAssist = showAssistForType(
                      isEdit ? editDraft.type : e.type
                    );
                    const showRef = showRefForType(
                      isEdit ? editDraft.type : e.type
                    );

                    return (
                      <div className="table__row" key={e.id}>
                        {!isEdit ? (
                          <>
                            <div>{e.half}</div>
                            <div>{e.minute}'</div>
                            <div>{TYPE_LABEL[e.type] || e.type}</div>
                            <div>{ttTitle(e.tournamentTeamId)}</div>
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
                            <div>
                              {refNameById(
                                e.issuedByRefereeId ??
                                  e.refereeId ??
                                  e.issued_by_referee_id
                              ) || '—'}
                            </div>
                            <div className="table__actions" style={{ gap: 8 }}>
                              <button
                                className="btn btn--xs"
                                onClick={() => startEditEvent(e)}
                              >
                                Изм.
                              </button>
                              <button
                                className="btn btn--xs btn--danger"
                                onClick={() => deleteEvent(e.id)}
                              >
                                Удалить
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <input
                                className="input input--sm"
                                type="number"
                                min={1}
                                max={halves}
                                value={editDraft.half}
                                onChange={(ev) =>
                                  setEditDraft((s) => ({
                                    ...s,
                                    half: ev.target.value,
                                  }))
                                }
                                style={{ width: 60 }}
                              />
                            </div>
                            <div>
                              <input
                                className="input input--sm"
                                type="number"
                                min={1}
                                max={Number(halfMinutes) || 45}
                                value={editDraft.minute}
                                onChange={(ev) =>
                                  setEditDraft((s) => ({
                                    ...s,
                                    minute: ev.target.value,
                                  }))
                                }
                                style={{ width: 70 }}
                              />
                            </div>
                            <div>
                              <select
                                className="input input--sm"
                                value={editDraft.type}
                                onChange={(ev) =>
                                  setEditDraft((s) => ({
                                    ...s,
                                    type: ev.target.value,
                                    assistPlayerId:
                                      ev.target.value === 'GOAL'
                                        ? s.assistPlayerId
                                        : '',
                                    refereeId: showRefForType(ev.target.value)
                                      ? s.refereeId
                                      : '',
                                  }))
                                }
                              >
                                {ALL_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {TYPE_LABEL[t] || t}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>{ttTitle(editDraft._tournamentTeamId)}</div>
                            <div>
                              {showPlayer ? (
                                <select
                                  className="input input--sm"
                                  value={editDraft.playerId}
                                  onChange={(ev) =>
                                    setEditDraft((s) => ({
                                      ...s,
                                      playerId: ev.target.value,
                                    }))
                                  }
                                >
                                  <option value="">—</option>
                                  {playersForTeam.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.number ? `#${p.number} ` : ''}
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                '—'
                              )}
                            </div>
                            <div>
                              {showAssist ? (
                                <select
                                  className="input input--sm"
                                  value={editDraft.assistPlayerId}
                                  onChange={(ev) =>
                                    setEditDraft((s) => ({
                                      ...s,
                                      assistPlayerId: ev.target.value,
                                    }))
                                  }
                                >
                                  <option value="">—</option>
                                  {playersForTeam.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.number ? `#${p.number} ` : ''}
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                '—'
                              )}
                            </div>
                            <div>
                              {showRef ? (
                                <select
                                  className="input input--sm"
                                  value={editDraft.refereeId}
                                  onChange={(ev) =>
                                    setEditDraft((s) => ({
                                      ...s,
                                      refereeId: ev.target.value,
                                    }))
                                  }
                                >
                                  <option value="">—</option>
                                  {referees.map((r) => (
                                    <option key={r.id} value={r.id}>
                                      {r.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                '—'
                              )}
                            </div>
                            <div className="table__actions" style={{ gap: 8 }}>
                              <button
                                className="btn btn--xs btn--primary"
                                onClick={saveEditEvent}
                                disabled={
                                  loading ||
                                  !editDraft.type ||
                                  (showPlayerForType(editDraft.type) &&
                                    !editDraft.playerId) ||
                                  (showRefForType(editDraft.type) &&
                                    !editDraft.refereeId)
                                }
                              >
                                Сохранить
                              </button>
                              <button
                                className="btn btn--xs btn--ghost"
                                onClick={cancelEditEvent}
                              >
                                Отмена
                              </button>
                              <button
                                className="btn btn--xs btn--danger"
                                onClick={() => deleteEvent(e.id)}
                              >
                                Удалить
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {showMvp && (
            <section className="card" style={{ marginTop: 12 }}>
              <div className="timeline__hdr">
                <h4 className="timeline__title">MVP матча</h4>
                <div className="row-actions">
                  <button
                    className="btn btn--sm btn--ghost"
                    onClick={() => setShowMvp(false)}
                  >
                    Закрыть
                  </button>
                </div>
              </div>
              {!mvpStats.best ? (
                <div className="muted">Недостаточно данных для MVP.</div>
              ) : (
                <>
                  <div className="alert">
                    Лучший: <b>{mvpStats.best.name}</b> (
                    {ttTitle(mvpStats.best.ttId)}) — очки:{' '}
                    <b>{mvpStats.best.score}</b>, голы:{' '}
                    <b>{mvpStats.best.goals}</b>, ассисты:{' '}
                    <b>{mvpStats.best.assists}</b>
                  </div>
                  <div className="table">
                    <div className="table__head">
                      <div style={{ minWidth: 220 }}>Игрок</div>
                      <div style={{ width: 200 }}>Команда</div>
                      <div style={{ width: 80 }}>Очки</div>
                      <div style={{ width: 80 }}>Голы</div>
                      <div style={{ width: 80 }}>Ассисты</div>
                      <div style={{ width: 80 }}>ЖК</div>
                      <div style={{ width: 80 }}>КК</div>
                    </div>
                    <div className="table__body">
                      {mvpStats.top.map((r) => (
                        <div key={r.playerId} className="table__row">
                          <div>{r.name}</div>
                          <div>{ttTitle(r.ttId)}</div>
                          <div>{r.score}</div>
                          <div>{r.goals}</div>
                          <div>{r.assists}</div>
                          <div>{r.yc}</div>
                          <div>{r.rc}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </section>
          )}
        </div>

        <div className="modal__footer">
          {status !== 'FINISHED' ? (
            <>
              <button
                className="btn btn--danger"
                onClick={finishMatch}
                disabled={loading}
              >
                Завершить матч
              </button>
              <div className="spacer" />
              <button className="btn" onClick={onClose}>
                Закрыть
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={downloadReportDocx}>
                Скачать DOCX
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => setShowMvp((v) => !v)}
              >
                MVP матча
              </button>
              <div className="spacer" />
              <button className="btn btn--primary" onClick={onClose}>
                Закрыть
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===================== Вкладка: Матчи турнира ===================== */
export default function TournamentMatchesTab({ tournamentId }) {
  const [matches, setMatches] = useState([]);
  const [ttRows, setTtRows] = useState([]); // TournamentTeam[] (include team, roster)
  const [ttIndex, setTtIndex] = useState(new Map());
  const [stadiums, setStadiums] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    date: '',
    team1TTId: '',
    team2TTId: '',
    stadiumId: '',
  });
  const resetForm = () =>
    setForm({ date: '', team1TTId: '', team2TTId: '', stadiumId: '' });

  const [liveMatch, setLiveMatch] = useState(null);

  async function loadMatches() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 199]),
      sort: JSON.stringify(['date', 'ASC']),
      filter: JSON.stringify({}),
    });
    const res = await fetch(
      `${API_T}/${tournamentId}/matches?${params.toString()}`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setMatches(Array.isArray(data) ? data : []);
  }
  async function loadTournamentTeams() {
    // include=roster чтобы можно было выбрать игроков при отсутствии опубликованных участников
    const res = await fetch(`${API_T}/${tournamentId}/teams?include=roster`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    const rows = Array.isArray(data) ? data : [];
    setTtRows(rows);
    const index = new Map();
    rows.forEach((tt) => {
      const byPlayer = new Map();
      (tt.roster || []).forEach((r) => {
        if (r.playerId != null) byPlayer.set(r.playerId, r.id);
      });
      index.set(tt.id, {
        ...tt,
        rosterIndexByPlayerId: byPlayer,
      });
    });
    setTtIndex(index);
  }
  async function loadStadiums() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 999]),
      sort: JSON.stringify(['name', 'ASC']),
      filter: JSON.stringify({}),
    });
    const res = await fetch(`${API_STADIUMS}?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setStadiums(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([
          loadMatches(),
          loadTournamentTeams(),
          loadStadiums(),
        ]);
      } catch (e) {
        console.error(e);
        setErr('Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  async function createMatch(e) {
    e.preventDefault();
    setErr('');
    try {
      const payload = {
        team1TTId: Number(form.team1TTId),
        team2TTId: Number(form.team2TTId),
        date: form.date || new Date().toISOString(),
        status: 'SCHEDULED',
        stadiumId: form.stadiumId ? Number(form.stadiumId) : null,
      };
      const res = await fetch(`${API_T}/${tournamentId}/matches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      resetForm();
      setShowCreate(false);
      await loadMatches();
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось создать матч');
    }
  }

  async function removeMatch(id) {
    if (!window.confirm('Удалить матч?')) return;
    try {
      const res = await fetch(`${serverConfig}/tournament-matches/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadMatches();
    } catch (e) {
      console.error(e);
      setErr('Не удалось удалить матч');
    }
  }

  const ttName = (ttId) => ttIndex.get(ttId)?.team?.title || `#${ttId}`;

  const patchMatchScore = (matchId, { team1Score, team2Score }) => {
    setMatches((list) =>
      list.map((m) => (m.id === matchId ? { ...m, team1Score, team2Score } : m))
    );
  };

  return (
    <div className="grid onecol">
      <div className="toolbar">
        <button
          className="btn btn--primary"
          onClick={() =>
            setShowCreate((prev) => {
              const next = !prev;
              if (!next) resetForm();
              return next;
            })
          }
          disabled={loading}
        >
          {showCreate ? 'Закрыть форму' : 'Создать матч'}
        </button>
      </div>

      {showCreate && (
        <section className="card">
          <h3>Создать матч</h3>
          {err && <div className="alert alert--error">{err}</div>}
          <form className="form" onSubmit={createMatch}>
            <div className="form__row">
              <label className="field">
                <span className="field__label">Дата</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, date: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Команда 1 (TT)</span>
                <select
                  className="input"
                  value={form.team1TTId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, team1TTId: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {ttRows.map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.team?.title} (#{tt.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Команда 2 (TT)</span>
                <select
                  className="input"
                  value={form.team2TTId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, team2TTId: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {ttRows.map((tt) => (
                    <option key={tt.id} value={tt.id}>
                      {tt.team?.title} (#{tt.id})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Стадион</span>
                <select
                  className="input"
                  value={form.stadiumId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, stadiumId: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {stadiums.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="form__actions">
              <button
                className="btn btn--primary"
                type="submit"
                disabled={loading}
              >
                Добавить
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  resetForm();
                  setShowCreate(false);
                }}
              >
                Отмена
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <h3>Матчи турнира</h3>
        <div className="table">
          <div className="table__head">
            <div>ID</div>
            <div>Дата</div>
            <div>Матч</div>
            <div>Счёт</div>
            <div>Действия</div>
          </div>
          <div className="table__body">
            {matches.length === 0 && (
              <div className="table__row muted">Нет матчей</div>
            )}
            {matches.map((m) => (
              <div className="table__row" key={m.id}>
                <div>#{m.id}</div>
                <div>{dtLoc(m.date)}</div>
                <div>
                  {ttName(m.team1TTId)} — {ttName(m.team2TTId)}
                </div>
                <div>
                  {m.team1Score}:{m.team2Score}
                </div>
                <div className="table__actions">
                  <button
                    className="btn btn--sm1"
                    onClick={() =>
                      setLiveMatch({
                        ...m,
                        tournamentId,
                      })
                    }
                  >
                    Провести матч
                  </button>
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={() => removeMatch(m.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {liveMatch && (
        <LiveTMatchModal
          match={liveMatch}
          ttIndex={ttIndex}
          onClose={() => setLiveMatch(null)}
          onScoreChanged={(id, score) => patchMatchScore(id, score)}
        />
      )}
    </div>
  );
}
