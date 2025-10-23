// src/admin/Leagues/Tabs/LeagueMatchesTab.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import serverConfig from '../../../../../serverConfig';
import './LeagueMatchesTab.css';

const API_MATCHES = `${serverConfig}/matches`;
const API_LEAGUES = `${serverConfig}/leagues`;
const API_PLAYERS = `${serverConfig}/players`;
const API_EVENTS = `${serverConfig}/matchEvents`;
const API_REFS = `${serverConfig}/referees`;

/* ===================== Вспомогалки ===================== */
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
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

/* ===================== Модалка: Провести матч ===================== */
function LiveMatchModal({ match, onClose, onScoreChanged }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Инфо лиги (для длительности тайма)
  const [halfMinutes, setHalfMinutes] = useState(45);
  const [halves, setHalves] = useState(2);

  // Игроки / судьи / события
  const [team1Players, setTeam1Players] = useState([]);
  const [team2Players, setTeam2Players] = useState([]);
  const [lineup1, setLineup1] = useState([]); // опубликованные на матч (Player[])
  const [lineup2, setLineup2] = useState([]);
  const [lineupFallback, setLineupFallback] = useState(false);
  const [referees, setReferees] = useState([]);
  const [events, setEvents] = useState([]);

  // Локальный счёт/статус
  const [score1, setScore1] = useState(match.team1Score ?? 0);
  const [score2, setScore2] = useState(match.team2Score ?? 0);
  const [status, setStatus] = useState(match.status || 'SCHEDULED');

  // Тайм и таймер
  const [currentHalf, setCurrentHalf] = useState(1);
  const [running, setRunning] = useState(false);
  const [halfStartTS, setHalfStartTS] = useState(null); // ms
  const [elapsed, setElapsed] = useState(0); // sec
  const tickRef = useRef(null);

  // Формы событий (создание)
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
  });

  const EVENT_TYPES = [
    { key: 'GOAL', label: 'Гол', icon: '⚽' },
    { key: 'PENALTY_SCORED', label: 'Гол (пенальти)', icon: '🥅' },
    { key: 'PENALTY_MISSED', label: 'Пенальти мимо', icon: '🚫' },
    { key: 'YELLOW_CARD', label: 'Жёлтая', icon: '🟨' },
    { key: 'RED_CARD', label: 'Красная', icon: '🟥' },
  ];
  const ALL_EVENT_TYPES = [
    'GOAL',
    'PENALTY_SCORED',
    'PENALTY_MISSED',
    'YELLOW_CARD',
    'RED_CARD',
    'SUBSTITUTION',
  ];
  const EVENT_TYPE_LABEL = {
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

  // --- загрузка справочников/данных
  async function loadLeague() {
    const res = await fetch(`${API_LEAGUES}/${match.leagueId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setHalfMinutes(data?.halfMinutes ?? 45);
    setHalves(data?.halves ?? 2);
  }
  async function loadPlayers() {
    const qs1 = new URLSearchParams({
      range: JSON.stringify([0, 199]),
      sort: JSON.stringify(['name', 'ASC']),
      filter: JSON.stringify({ teamId: match.team1Id }),
    });
    const qs2 = new URLSearchParams({
      range: JSON.stringify([0, 199]),
      sort: JSON.stringify(['name', 'ASC']),
      filter: JSON.stringify({ teamId: match.team2Id }),
    });
    const [r1, r2] = await Promise.all([
      fetch(`${API_PLAYERS}?${qs1}`),
      fetch(`${API_PLAYERS}?${qs2}`),
    ]);
    const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
    if (!r1.ok) throw new Error(d1?.error || `HTTP ${r1.status}`);
    if (!r2.ok) throw new Error(d2?.error || `HTTP ${r2.status}`);
    setTeam1Players(Array.isArray(d1) ? d1 : []);
    setTeam2Players(Array.isArray(d2) ? d2 : []);
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

  // Попытка загрузить участников матча (PlayerMatch → player)
  async function loadMatchParticipants() {
    const byTeam = (list, teamId) =>
      (Array.isArray(list) ? list : [])
        .filter((pm) => pm?.player && pm.player.teamId === teamId)
        .map((pm) => pm.player);

    // Вариант 1: /matches/:id?include=participants,participants.player
    try {
      const res = await fetch(
        `${API_MATCHES}/${match.id}?include=participants,participants.player`
      );
      const data = await res.json();
      if (res.ok && Array.isArray(data?.participants)) {
        const t1 = byTeam(data.participants, match.team1Id);
        const t2 = byTeam(data.participants, match.team2Id);
        if (t1.length || t2.length) {
          setLineup1(t1);
          setLineup2(t2);
          setLineupFallback(false);
          return;
        }
      }
    } catch {}

    // Вариант 2: /matches/:id/participants
    try {
      const res = await fetch(`${API_MATCHES}/${match.id}/participants`);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        const t1 = byTeam(data, match.team1Id);
        const t2 = byTeam(data, match.team2Id);
        if (t1.length || t2.length) {
          setLineup1(t1);
          setLineup2(t2);
          setLineupFallback(false);
          return;
        }
      }
    } catch {}

    // Фолбэк — состава нет/не пришёл
    setLineup1([]);
    setLineup2([]);
    setLineupFallback(true);
  }

  // Кэш игроков по id
  const playerIndex = useMemo(() => {
    const m = new Map();
    [...team1Players, ...team2Players, ...lineup1, ...lineup2].forEach((p) => {
      if (p?.id) m.set(p.id, p);
    });
    return m;
  }, [team1Players, team2Players, lineup1, lineup2]);

  // Кэш судей по id
  const refereeIndex = useMemo(() => {
    const m = new Map();
    (referees || []).forEach((r) => {
      if (r?.id) m.set(r.id, r);
    });
    return m;
  }, [referees]);

  const playerLabelById = (id) => {
    const p = playerIndex.get(Number(id));
    if (!p) return id ? `#${id}` : '';
    return `${p.number ? `#${p.number} ` : ''}${p.name}`;
  };
  const pn = (pObj, id) => {
    if (pObj && (pObj.name || pObj.number != null)) {
      return `${pObj.number ? `#${pObj.number} ` : ''}${pObj.name}`;
    }
    return playerLabelById(id);
  };

  const refNameById = (id) => {
    const r = refereeIndex.get(Number(id));
    return r?.name || (id != null ? `#${id}` : '');
  };

  // Умный экстрактор имени судьи из события
  const getRefereeName = (e) => {
    if (!e) return '';
    // 1) если бэкенд вернул связанную модель
    if (e.issuedByReferee?.name) return e.issuedByReferee.name;
    if (e.referee?.name) return e.referee.name;

    // 2) найти любой nested-объект *referee* с name
    for (const [k, v] of Object.entries(e)) {
      if (
        k.toLowerCase().includes('referee') &&
        v &&
        typeof v === 'object' &&
        v.name
      ) {
        return v.name;
      }
    }

    // 3) фолбэк: по id-полю вытянуть из локального справочника судей
    const idKey = Object.keys(e).find((k) => {
      const lk = k.toLowerCase();
      const val = e[k];
      return (
        (lk.endsWith('refereeid') || lk.includes('referee')) &&
        (typeof val === 'number' || typeof val === 'string')
      );
    });
    if (idKey) return refNameById(e[idKey]) || '';

    return '';
  };

  const getRefereeId = (e) => {
    if (!e) return '';
    if (e.issuedByRefereeId != null) return e.issuedByRefereeId;
    if (e.refereeId != null) return e.refereeId;
    if (e.issued_by_referee_id != null) return e.issued_by_referee_id;
    if (e.issuedByReferee?.id != null) return e.issuedByReferee.id;
    if (e.referee?.id != null) return e.referee.id;
    // попытка найти первый nested referee с id
    for (const [k, v] of Object.entries(e)) {
      if (
        k.toLowerCase().includes('referee') &&
        v &&
        typeof v === 'object' &&
        (v.id != null || v.refereeId != null)
      ) {
        return v.id ?? v.refereeId ?? '';
      }
    }
    return '';
  };

  // Загрузка событий (с attempt include + фолбэком) + пересчёт счёта
  async function loadEvents() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 999]),
      sort: JSON.stringify(['id', 'ASC']),
      filter: JSON.stringify({ matchId: match.id }),
    });

    let url = `${API_EVENTS}?${params.toString()}&include=player,assist_player,issuedByReferee,referee,team`;
    let res = await fetch(url);
    let data = await res.json().catch(() => []);
    if (!res.ok) {
      res = await fetch(`${API_EVENTS}?${params.toString()}`);
      data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    }
    const list = Array.isArray(data) ? data : [];
    setEvents(list);
    // пересчёт счёта по событиям
    const { s1, s2 } = calcScoreFromEvents(list);
    setScore1(s1);
    setScore2(s2);
    onScoreChanged?.(match.id, { team1Score: s1, team2Score: s2 });
  }

  const calcScoreFromEvents = (list) => {
    const goals = new Map(); // teamId -> count
    (list || []).forEach((e) => {
      if (e.type === 'GOAL' || e.type === 'PENALTY_SCORED') {
        goals.set(e.teamId, (goals.get(e.teamId) || 0) + 1);
      }
    });
    return {
      s1: goals.get(match.team1Id) || 0,
      s2: goals.get(match.team2Id) || 0,
    };
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await Promise.all([
          loadLeague(),
          loadPlayers(),
          loadRefs(),
          loadMatchParticipants(),
          loadEvents(),
        ]);
        setStatus(match.status || 'SCHEDULED');
      } catch (e) {
        console.error(e);
        setErr(e.message || 'Ошибка загрузки данных для проведения матча');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id]);

  // --- таймер
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

  const teamTitleById = (id) =>
    id === match.team1Id
      ? match.team1?.title || `#${match.team1Id}`
      : id === match.team2Id
      ? match.team2?.title || `#${match.team2Id}`
      : `#${id}`;

  const renderEventText = (e) => {
    const judge = getRefereeName(e);
    switch (e.type) {
      case 'GOAL':
        return `Гол — ${pn(e.player, e.playerId)}${
          e.assist_player || e.assistPlayerId
            ? ` (ассист: ${pn(e.assist_player, e.assistPlayerId)})`
            : ''
        }`;
      case 'PENALTY_SCORED':
        return `Гол с пенальти — ${pn(e.player, e.playerId)}`;
      case 'PENALTY_MISSED':
        return `Пенальти не забит — ${pn(e.player, e.playerId)}`;
      case 'YELLOW_CARD':
        return `ЖК — ${pn(e.player, e.playerId)}${
          judge ? ` (судья: ${judge})` : ''
        }`;
      case 'RED_CARD':
        return `КК — ${pn(e.player, e.playerId)}${
          judge ? ` (судья: ${judge})` : ''
        }`;
      default:
        return e.type || 'Событие';
    }
  };

  async function submitEvent(side, form) {
    try {
      setLoading(true);
      setErr('');
      if (!form.type) throw new Error('Выберите тип события');
      const teamId = side === 1 ? match.team1Id : match.team2Id;
      const minuteToSend = Number(form.minute) || halfMinuteNow;

      const refId = form.refereeId ? Number(form.refereeId) : null;

      const payload = {
        matchId: match.id,
        teamId,
        type: form.type,
        half: currentHalf,
        minute: minuteToSend,
        playerId: form.playerId ? Number(form.playerId) : null,
        assistPlayerId: form.assistPlayerId
          ? Number(form.assistPlayerId)
          : null,
        description: form.description || null,

        // судья — шлём во все популярные поля, чтобы бэку было проще принять
        issuedByRefereeId: refId, // camelCase (ваша сх.)
        refereeId: refId, // короткое
        issued_by_referee_id: refId, // snake_case — на всякий
      };

      const res = await fetch(API_EVENTS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
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

  /* ---------- Редактирование / удаление события ---------- */
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

  function startEditEvent(e) {
    setEditEventId(e.id);
    setEditDraft({
      type: e.type || 'GOAL',
      half: e.half ?? 1,
      minute: e.minute ?? '',
      playerId: e.playerId ?? '',
      assistPlayerId: e.assistPlayerId ?? '',
      refereeId: getRefereeId(e) ?? '',
      description: e.description || '',
      _teamId: e.teamId, // для выбора списка игроков
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
    });
  }

  async function saveEditEvent() {
    if (!editEventId) return;
    try {
      setLoading(true);
      setErr('');
      const refId = editDraft.refereeId ? Number(editDraft.refereeId) : null;
      const payload = {
        type: editDraft.type,
        half: Number(editDraft.half) || 1,
        minute: Number(editDraft.minute) || 1,
        playerId: editDraft.playerId ? Number(editDraft.playerId) : null,
        assistPlayerId: editDraft.assistPlayerId
          ? Number(editDraft.assistPlayerId)
          : null,
        description: editDraft.description || null,
        issuedByRefereeId: refId,
        refereeId: refId,
        issued_by_referee_id: refId,
      };
      const res = await fetch(`${API_EVENTS}/${editEventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
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
      const res = await fetch(`${API_EVENTS}/${id}`, { method: 'DELETE' });
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
      if (!window.confirm('Завершить матч? Изменить статус на «Завершён».'))
        return;
      setLoading(true);
      setErr('');
      setRunning(false);

      const payload = {
        status: 'FINISHED',
        team1Score: Number(score1) || 0,
        team2Score: Number(score2) || 0,
      };
      const res = await fetch(`${API_MATCHES}/${match.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
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

  /* ---------- MVP вычисление и панель ---------- */
  const mvpStats = useMemo(() => {
    // агрегируем по игроку
    const map = new Map(); // playerId -> {goals, pens, assists, yc, rc, pmissed, teamId}
    const inc = (pid, key, teamId) => {
      if (!pid) return;
      const row = map.get(pid) || {
        goals: 0,
        pens: 0,
        assists: 0,
        yc: 0,
        rc: 0,
        pmissed: 0,
        teamId,
      };
      row[key] = (row[key] || 0) + 1;
      if (!row.teamId && teamId) row.teamId = teamId;
      map.set(pid, row);
    };
    (events || []).forEach((e) => {
      if (e.type === 'GOAL') inc(e.playerId, 'goals', e.teamId);
      if (e.type === 'PENALTY_SCORED') inc(e.playerId, 'pens', e.teamId);
      if (e.type === 'PENALTY_MISSED') inc(e.playerId, 'pmissed', e.teamId);
      if (e.type === 'YELLOW_CARD') inc(e.playerId, 'yc', e.teamId);
      if (e.type === 'RED_CARD') inc(e.playerId, 'rc', e.teamId);
      if (e.assistPlayerId) inc(e.assistPlayerId, 'assists', e.teamId);
    });

    // очки
    const winner =
      score1 > score2 ? match.team1Id : score2 > score1 ? match.team2Id : null;

    const rows = [...map.entries()].map(([playerId, r]) => {
      let score =
        r.goals * 3 +
        r.pens * 2 +
        r.assists * 2 -
        r.yc * 1 -
        r.rc * 3 -
        r.pmissed * 2;
      // маленький бонус победителям, если есть положит. вклад
      if (winner && r.teamId === winner && r.goals + r.pens + r.assists > 0) {
        score += 1;
      }
      return {
        playerId: Number(playerId),
        name: playerLabelById(playerId),
        number: playerIndex.get(Number(playerId))?.number,
        teamId: r.teamId,
        score,
        goals: r.goals + r.pens,
        assists: r.assists,
        yc: r.yc,
        rc: r.rc,
      };
    });

    rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      if (a.rc !== b.rc) return a.rc - b.rc; // меньше КК лучше
      if (a.yc !== b.yc) return a.yc - b.yc; // меньше ЖК лучше
      return a.playerId - b.playerId;
    });

    return {
      best: rows[0] || null,
      top: rows.slice(0, 5),
    };
  }, [events, score1, score2, playerIndex]);

  const [showMvp, setShowMvp] = useState(false);

  /* ---------- Протокол: HTML-основание ---------- */
  function buildProtocolHtml() {
    const t1 = match.team1?.title || `#${match.team1Id}`;
    const t2 = match.team2?.title || `#${match.team2Id}`;

    const lineupTable = (title, arr, noteIfEmpty) => {
      const rows = (arr || []).map(
        (p) =>
          `<tr><td style="text-align:right;width:70px">${
            p.number ?? ''
          }</td><td>${escapeHtml(p.name || '')}</td></tr>`
      );
      const note = noteIfEmpty
        ? `<div class="note">Примечание: официальный состав не опубликован. Показан общий список игроков команды.</div>`
        : '';
      return `
        <div class="block">
          <h3>${escapeHtml(title)}</h3>
          ${note}
          <table class="tbl">
            <thead><tr><th style="width:70px">№</th><th>Игрок</th></tr></thead>
            <tbody>${rows.join('') || '<tr><td colspan="2">—</td></tr>'}</tbody>
          </table>
        </div>`;
    };

    const eventRows = (events || []).map((e) => {
      const typeLabel = EVENT_TYPE_LABEL[e.type] || e.type;
      const player = pn(e.player, e.playerId) || '—';
      const assist =
        e.assist_player || e.assistPlayerId
          ? pn(e.assist_player, e.assistPlayerId)
          : '—';
      const ref = getRefereeName(e) || '—';
      const team = e.team?.title || teamTitleById(e.teamId);
      return `<tr>
        <td style="text-align:center">${e.half ?? ''}</td>
        <td style="text-align:center">${e.minute ?? ''}'</td>
        <td>${escapeHtml(typeLabel)}</td>
        <td>${escapeHtml(player)}</td>
        <td>${escapeHtml(assist)}</td>
        <td>${escapeHtml(ref)}</td>
        <td>${escapeHtml(team)}</td>
        <td>${escapeHtml(e.description || '')}</td>
      </tr>`;
    });

    const html = `<!doctype html>
<html lang="ru">
<meta charset="utf-8">
<title>Протокол матча #${match.id}</title>
<style>
  body{font:14px/1.42 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Arial,sans-serif;color:#111;padding:24px;}
  h1{margin:0 0 6px 0;font-size:22px}
  h2{margin:18px 0 6px 0;font-size:18px}
  h3{margin:12px 0 6px 0;font-size:16px}
  .meta{color:#444;margin-bottom:10px}
  .score{font-size:28px;font-weight:800;margin:8px 0 12px 0}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  .tbl{width:100%;border-collapse:collapse}
  .tbl th,.tbl td{border:1px solid #ddd;padding:6px 8px;vertical-align:top}
  .tbl thead th{background:#f8f9fb}
  .note{font-size:12px;color:#666;margin:8px 0}
  .block{break-inside:avoid}
  @media print {.no-print{display:none}}
</style>
<body>
  <h1>Протокол матча №${match.id}</h1>
  <div class="meta">
    ${escapeHtml(t1)} — ${escapeHtml(t2)}<br>
    Дата: ${escapeHtml(dtLoc(match.date))} • Статус: ${escapeHtml(
      statusRu(status)
    )}
  </div>

  <h2>Счёт</h2>
  <div class="score">${escapeHtml(t1)} — ${escapeHtml(t2)}: <b>${Number(
      score1
    )}</b>:<b>${Number(score2)}</b></div>

  <h2>События</h2>
  <table class="tbl">
    <thead>
      <tr>
        <th style="width:60px">Тайм</th>
        <th style="width:70px">Минута</th>
        <th style="width:160px">Тип</th>
        <th style="width:160px">Игрок</th>
        <th style="width:160px">Ассистент</th>
        <th style="width:150px">Судья</th>
        <th style="min-width:180px">Команда</th>
        <th>Комментарий</th>
      </tr>
    </thead>
    <tbody>${
      eventRows.join('') || '<tr><td colspan="8">Событий нет</td></tr>'
    }</tbody>
  </table>

  <h2>Составы команд</h2>
  <div class="grid2">
    ${lineupTable(
      `${t1} — состав`,
      lineup1 && lineup1.length ? lineup1 : team1Players,
      !(lineup1 && lineup1.length)
    )}
    ${lineupTable(
      `${t2} — состав`,
      lineup2 && lineup2.length ? lineup2 : team2Players,
      !(lineup2 && lineup2.length)
    )}
  </div>
</body>
</html>`;
    return html;
  }

  /* ---------- DOCX ---------- */
  async function downloadReportDocx() {
    try {
      setLoading(true);
      const docx = await import('docx'); // динамический импорт
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

      const t1 = match.team1?.title || `#${match.team1Id}`;
      const t2 = match.team2?.title || `#${match.team2Id}`;

      const H = (text, level = HeadingLevel.HEADING_2) =>
        new Paragraph({ text, heading: level });

      const P = (text, opts = {}) =>
        new Paragraph({
          children: [new TextRun(String(text || ''))],
          ...opts,
        });

      const makeTable = (headCells, rows) => {
        const head = new TableRow({
          children: headCells.map(
            (c) =>
              new TableCell({
                children: [P(c)],
              })
          ),
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

      // Счёт
      const scorePara = new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun(`${t1} — ${t2}: `),
          new TextRun({ text: String(Number(score1)), bold: true }),
          new TextRun(':'),
          new TextRun({ text: String(Number(score2)), bold: true }),
        ],
      });

      // Таблица событий
      const eventRows = (events || []).map((e) => [
        String(e.half ?? ''),
        `${e.minute ?? ''}'`,
        EVENT_TYPE_LABEL[e.type] || e.type,
        pn(e.player, e.playerId) || '—',
        e.assist_player || e.assistPlayerId
          ? pn(e.assist_player, e.assistPlayerId)
          : '—',
        getRefereeName(e) || '—',
        e.team?.title || teamTitleById(e.teamId),
        e.description || '',
      ]);

      // Составы
      const listOrFallback = (line, all) =>
        line && line.length ? line : all || [];
      const lineupRows1 = listOrFallback(lineup1, team1Players).map((p) => [
        String(p.number ?? ''),
        p.name || '',
      ]);
      const lineupRows2 = listOrFallback(lineup2, team2Players).map((p) => [
        String(p.number ?? ''),
        p.name || '',
      ]);

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: { top: 720, right: 720, bottom: 720, left: 720 },
              }, // 1" margins
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
                      'Примечание: официальный состав не опубликован. Показан общий список игроков команды.'
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
                      'Примечание: официальный состав не опубликован. Показан общий список игроков команды.'
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
      a.download = `match_${match.id}_protocol.docx`;
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

  /* ---------- PDF (опционально) ---------- */
  async function downloadReportPdf() {
    try {
      setLoading(true);
      const html2pdf = (await import('html2pdf.js')).default;
      const html = buildProtocolHtml();
      const el = document.createElement('div');
      el.style.position = 'fixed';
      el.style.left = '-99999px';
      el.innerHTML = html;
      document.body.appendChild(el);

      await html2pdf()
        .from(el)
        .set({
          margin: 10,
          filename: `match_${match.id}_protocol.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .save();

      document.body.removeChild(el);
    } catch (e) {
      console.error(e);
      alert(
        'Не удалось сформировать PDF. Убедитесь, что установлен пакет "html2pdf.js".'
      );
    } finally {
      setLoading(false);
    }
  }

  /* --------- Сайд-панель: слева/справа одинаковая --------- */
  const SidePanel = ({ side }) => {
    const isHome = side === 1;
    const teamTitle = isHome
      ? match.team1?.title || `#${match.team1Id}`
      : match.team2?.title || `#${match.team2Id}`;

    const players = (isHome ? lineup1 : lineup2)?.length
      ? isHome
        ? lineup1
        : lineup2
      : isHome
      ? team1Players
      : team2Players;

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
          {EVENT_TYPES.map((t) => (
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

        {/* ФОРМА ВСЕГДА на месте — без скачков верстки */}
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
                    placeholder="например: удар слёта в дальний"
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

  return (
    <div className="modal live-modal">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__dialog live-modal__dialog">
        <div className="modal__header">
          <h3 className="modal__title">
            Проведение матча: {match.team1?.title || `#${match.team1Id}`} —{' '}
            {match.team2?.title || `#${match.team2Id}`}
          </h3>
          <button className="btn btn--ghost" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal__body">
          {err && <div className="alert alert--error">{err}</div>}
          {loading && <div className="alert">Загрузка…</div>}

          <div className="live-threecol">
            {/* Левая панель */}
            <SidePanel side={1} />

            {/* Центральное табло */}
            <section className="card scoreboard">
              <div className="scoreboard__teams">
                <div className="scoreboard__team scoreboard__team--left">
                  {match.team1?.title || `#${match.team1Id}`}
                </div>
                <div className="scoreboard__team scoreboard__team--right">
                  {match.team2?.title || `#${match.team2Id}`}
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
                  {/* <button className="btn btn--sm" onClick={downloadReportPdf}>
                    Скачать PDF
                  </button> */}
                  <button className="btn btn--sm" onClick={downloadReportDocx}>
                    Скачать DOCX
                  </button>
                </div>
              )}
            </section>

            {/* Правая панель */}
            <SidePanel side={2} />
          </div>

          {/* Хронология */}
          <section className="card timeline">
            <div className="timeline__hdr">
              <h4 className="timeline__title">Хронология событий</h4>
              {status === 'FINISHED' && (
                <div className="row-actions">
                  {/* <button className="btn btn--sm" onClick={downloadReportPdf}>
                    Скачать PDF
                  </button> */}
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
                      (e.teamId === match.team1Id
                        ? lineup1?.length
                          ? lineup1
                          : team1Players
                        : lineup2?.length
                        ? lineup2
                        : team2Players) || [];
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
                            <div>{EVENT_TYPE_LABEL[e.type] || e.type}</div>
                            <div>
                              {e.team?.title || teamTitleById(e.teamId)}
                            </div>
                            <div>{pn(e.player, e.playerId) || '—'}</div>
                            <div>
                              {e.assist_player || e.assistPlayerId
                                ? pn(e.assist_player, e.assistPlayerId)
                                : '—'}
                            </div>
                            <div>{getRefereeName(e) || '—'}</div>
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
                            {/* Тайм */}
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
                            {/* Минута */}
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
                            {/* Тип */}
                            <div>
                              <select
                                className="input input--sm"
                                value={editDraft.type}
                                onChange={(ev) =>
                                  setEditDraft((s) => ({
                                    ...s,
                                    type: ev.target.value,
                                    // если поменяли тип, возможно нужно очистить лишние поля
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
                                {ALL_EVENT_TYPES.map((t) => (
                                  <option key={t} value={t}>
                                    {EVENT_TYPE_LABEL[t] || t}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {/* Команда (read-only) */}
                            <div>
                              {e.team?.title || teamTitleById(e.teamId)}
                            </div>
                            {/* Игрок */}
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
                            {/* Ассистент */}
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
                            {/* Судья */}
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
                            {/* Действия */}
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

          {/* MVP панель (по кнопке) */}
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
                <div className="muted">
                  Недостаточно данных в событиях, чтобы определить MVP.
                </div>
              ) : (
                <>
                  <div className="alert">
                    Лучший по версии системы: <b>{mvpStats.best.name}</b> (
                    {mvpStats.best.number ? `#${mvpStats.best.number}, ` : ''}
                    {teamTitleById(
                      playerIndex.get(mvpStats.best.playerId)?.teamId
                    )}
                    ) — очки: <b>{mvpStats.best.score}</b>, голы:{' '}
                    <b>{mvpStats.best.goals}</b>, ассисты:{' '}
                    <b>{mvpStats.best.assists}</b>
                  </div>
                  <div className="table">
                    <div className="table__head">
                      <div style={{ minWidth: 220 }}>Игрок</div>
                      <div style={{ width: 120 }}>Команда</div>
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
                          <div>
                            {teamTitleById(playerIndex.get(r.playerId)?.teamId)}
                          </div>
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
              {/* <button className="btn" onClick={downloadReportPdf}>
                Скачать PDF
              </button> */}
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

/* ===================== Оcновная вкладка матчей лиги ===================== */
export default function LeagueMatchesTab({ leagueId }) {
  const [matches, setMatches] = useState([]);
  const [teams, setTeams] = useState([]);
  const [stadiums, setStadiums] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    date: '',
    team1Id: '',
    team2Id: '',
    stadiumId: '',
    team1Score: 0,
    team2Score: 0,
  });

  const resetForm = () =>
    setForm({
      date: '',
      team1Id: '',
      team2Id: '',
      stadiumId: '',
      team1Score: 0,
      team2Score: 0,
    });

  const [liveMatch, setLiveMatch] = useState(null);

  async function loadMatches() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 199]),
      sort: JSON.stringify(['date', 'ASC']),
      filter: JSON.stringify({ leagueId }),
    });
    const res = await fetch(`${API_MATCHES}?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setMatches(Array.isArray(data) ? data : []);
  }
  async function loadLeagueTeams() {
    const res = await fetch(`${API_LEAGUES}/${leagueId}/teams`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    const list = Array.isArray(data)
      ? data.map((t) => (t.team ? t.team : t))
      : [];
    setTeams(list);
  }
  async function loadStadiums() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 999]),
      sort: JSON.stringify(['name', 'ASC']),
      filter: JSON.stringify({}),
    });
    const res = await fetch(`${serverConfig}/stadiums?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setStadiums(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadMatches(), loadLeagueTeams(), loadStadiums()]);
      } catch (e) {
        console.error(e);
        setErr('Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [leagueId]);

  async function createMatch(e) {
    e.preventDefault();
    setErr('');
    try {
      const payload = {
        leagueId: Number(leagueId),
        date: form.date || new Date().toISOString(),
        team1Id: Number(form.team1Id),
        team2Id: Number(form.team2Id),
        stadiumId: form.stadiumId ? Number(form.stadiumId) : null,
        status: 'SCHEDULED',
        team1Score: Number(form.team1Score) || 0,
        team2Score: Number(form.team2Score) || 0,
      };
      const res = await fetch(API_MATCHES, {
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
      const res = await fetch(`${API_MATCHES}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadMatches();
    } catch (e) {
      console.error(e);
      setErr('Не удалось удалить матч');
    }
  }

  const teamName = (id) => teams.find((t) => t.id === id)?.title || `#${id}`;

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
                <span className="field__label">Хозяева</span>
                <select
                  className="input"
                  value={form.team1Id}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, team1Id: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Гости</span>
                <select
                  className="input"
                  value={form.team2Id}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, team2Id: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
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

            <div className="form__row">
              <label className="field">
                <span className="field__label">Счёт хозяев</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={1}
                  value={form.team1Score}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, team1Score: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Счёт гостей</span>
                <input
                  className="input"
                  type="number"
                  min={0}
                  step={1}
                  value={form.team2Score}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, team2Score: e.target.value }))
                  }
                />
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
        <h3>Матчи лиги</h3>
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
                  {teamName(m.team1Id)} — {teamName(m.team2Id)}
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
                        team1: teams.find((t) => t.id === m.team1Id) || null,
                        team2: teams.find((t) => t.id === m.team2Id) || null,
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
        <LiveMatchModal
          match={liveMatch}
          onClose={() => setLiveMatch(null)}
          onScoreChanged={(id, score) => patchMatchScore(id, score)}
        />
      )}
    </div>
  );
}
