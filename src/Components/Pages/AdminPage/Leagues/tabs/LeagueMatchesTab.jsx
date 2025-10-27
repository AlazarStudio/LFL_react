// src/admin/Leagues/Tabs/LeagueMatchesTab.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import serverConfig from '../../../../../serverConfig';
import './LeagueMatchesTab.css';

const API_MATCHES = `${serverConfig}/matches`;
const API_LEAGUES = `${serverConfig}/leagues`;
const API_PLAYERS = `${serverConfig}/players`;
const API_EVENTS = `${serverConfig}/matchEvents`;
const API_REFS = `${serverConfig}/referees`;

import uploadsConfig from '../../../../../uploadsConfig';
import PosterCal from './posters/PosterCal';
import PosterResults from './posters/PosterResults';
import PosterTop5 from './posters/PosterTop5';
import PosterTable from './posters/PosterTable';

const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');
const buildSrc = (p) =>
  !p ? '' : /^https?:\/\//i.test(p) ? p : `${ASSETS_BASE}${p}`;
const teamById = (teams, id) => teams.find((t) => t.id === id) || {};
const teamLogo = (team) => {
  const p =
    team?.logo?.[0]?.src ??
    team?.logo?.[0] ??
    team?.images?.[0]?.src ??
    team?.images?.[0] ??
    '';
  return buildSrc(p);
};

const playerPhoto = (p) => {
  const src =
    p?.images?.[0]?.src ?? // приоритет: images[0].src
    p?.images?.[0] ?? // или images[0] как строка
    p?.photo?.[0]?.src ??
    p?.photo ??
    p?.avatar?.[0]?.src ??
    p?.avatar ??
    p?.image ??
    '';
  return buildSrc(src);
};

const fmtHM = (iso) =>
  new Date(iso).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
const fmtDDMMMM = (iso) =>
  new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

// ---------- справочник ролей судей ----------
const REF_ROLES = ['MAIN', 'AR1', 'AR2', 'FOURTH', 'VAR', 'AVAR', 'OBSERVER'];
const REF_ROLE_LABEL = {
  MAIN: 'Главный',
  AR1: 'Ассистент 1',
  AR2: 'Ассистент 2',
  FOURTH: 'Четвёртый',
  VAR: 'VAR',
  AVAR: 'AVAR',
  OBSERVER: 'Инспектор',
};

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

  useEffect(() => {
    const stopEsc = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener('keydown', stopEsc, true);
    return () => document.removeEventListener('keydown', stopEsc, true);
  }, []);

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

  const [leagueTitle, setLeagueTitle] = useState('');
  const [stadiumName, setStadiumName] = useState('');
  const [appRoster1, setAppRoster1] = useState([]); // [{id,name,number,role}]
  const [appRoster2, setAppRoster2] = useState([]);
  const [showCalModal, setShowCalModal] = useState(false);
  const [calDate, setCalDate] = useState(''); // YYYY-MM-DD
  const posterRef = useRef(null);
  const [posterData, setPosterData] = useState(null); // {titleDay, titleVenue, matches:[]}
  const [posterMode, setPosterMode] = useState('cal'); // 'cal' | 'res'

  function buildPosterData(dateStr) {
    if (!dateStr) return null;
    const dayStart = new Date(dateStr + 'T00:00:00');
    const dayEnd = new Date(dateStr + 'T23:59:59');

    const dayMatches = (matches || []).filter((m) => {
      const d = new Date(m.date);
      return d >= dayStart && d <= dayEnd;
    });
    if (!dayMatches.length) return null;

    const venues = [
      ...new Set(
        dayMatches
          .map((m) => stadiums.find((s) => s.id === m.stadiumId)?.name)
          .filter(Boolean)
      ),
    ];

    const rows = dayMatches.map((m) => {
      const h = teamById(teams, m.team1Id);
      const a = teamById(teams, m.team2Id);
      return {
        time: fmtHM(m.date),
        home: { name: h?.title || `#${m.team1Id}`, logo: teamLogo(h) },
        away: { name: a?.title || `#${m.team2Id}`, logo: teamLogo(a) },
      };
    });

    return {
      titleDay: fmtDDMMMM(dayMatches[0].date),
      titleVenue: venues.join(', ') || '—',
      matches: rows,
      season: new Date(dayMatches[0].date).getFullYear(),
    };
  }

  async function downloadCalendarJPG() {
    setPosterMode('cal');
    const data = buildPosterData(calDate);
    if (!data) {
      alert('На выбранную дату матчей нет');
      return;
    }
    setPosterData(data);
    await new Promise((r) => setTimeout(r, 0)); // дождаться рендера

    const { toJpeg } = await import('html-to-image');
    const node = posterRef.current;
    const dataUrl = await toJpeg(node, { pixelRatio: 2, quality: 0.95 });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `calendar_${calDate}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setPosterData(null);
  }

  async function loadLeagueRosters() {
    try {
      const params = new URLSearchParams({
        include: 'team,roster,roster.player', // чтобы пришли игроки внутри roster
      });
      const res = await fetch(
        `${API_LEAGUES}/${match.leagueId}/teams?${params}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      const rows = Array.isArray(data) ? data : [];
      const byTeamId = new Map(
        rows.map((lt) => [lt.team?.id ?? lt.teamId, lt])
      );

      const order = { STARTER: 0, SUBSTITUTE: 1, RESERVE: 2 };
      const pick = (teamId) => {
        const lt = byTeamId.get(teamId);
        const list = Array.isArray(lt?.roster) ? lt.roster : [];
        const mapped = list
          .map((r) => ({
            id: r.playerId ?? r.player?.id,
            name: r.player?.name ?? '',
            number: r.number ?? r.player?.number ?? '',
            role: r.role ?? 'STARTER',
          }))
          .filter((x) => x.id != null);

        mapped.sort(
          (a, b) =>
            order[a.role] - order[b.role] ||
            (a.number ?? 999) - (b.number ?? 999) ||
            a.name.localeCompare(b.name, 'ru')
        );
        return mapped;
      };

      setAppRoster1(pick(match.team1Id));
      setAppRoster2(pick(match.team2Id));
    } catch (e) {
      console.warn('loadLeagueRosters failed', e);
      setAppRoster1([]);
      setAppRoster2([]);
    }
  }

  const toAbsMin = (e) =>
    (Number(e.half || 1) - 1) * (Number(halfMinutes) || 45) +
    Number(e.minute || 0);

  const goalsBy = useMemo(() => {
    const m = new Map();
    (events || []).forEach((e) => {
      if (e.type === 'GOAL' || e.type === 'PENALTY_SCORED') {
        if (e.playerId)
          m.set(e.playerId, [...(m.get(e.playerId) || []), toAbsMin(e)]);
      }
    });
    return m;
  }, [events, halfMinutes]);

  const assistsBy = useMemo(() => {
    const m = new Map();
    (events || []).forEach((e) => {
      if (e.assistPlayerId)
        m.set(e.assistPlayerId, [
          ...(m.get(e.assistPlayerId) || []),
          toAbsMin(e),
        ]);
    });
    return m;
  }, [events, halfMinutes]);

  const minsStr = (arr) =>
    (arr || [])
      .slice()
      .sort((a, b) => a - b)
      .join(', ');

  // --- загрузка справочников/данных
  async function loadLeague() {
    const res = await fetch(`${API_LEAGUES}/${match.leagueId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setHalfMinutes(data?.halfMinutes ?? 45);
    setHalves(data?.halves ?? 2);
    setLeagueTitle(data?.title || data?.name || '');
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

  useEffect(() => {
    (async () => {
      try {
        // если имя стадиона не пришло — подтянем по id
        if (match.stadium?.name) setStadiumName(match.stadium.name);
        else if (match.stadiumId) {
          const r = await fetch(`${serverConfig}/stadiums/${match.stadiumId}`);
          const d = await r.json();
          if (r.ok) setStadiumName(d?.name || '');
        }
      } catch {}
    })();
  }, [match.stadiumId]);

  // 2) хелпер для даты
  const ruDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const date = d.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
    });
    const time = d.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date} ${time}`;
  };

  // 3) генерация DOCX заявки
  async function downloadApplicationDocx() {
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
        AlignmentType,
        BorderStyle,
      } = docx;

      const t1 = match.team1?.title || `#${match.team1Id}`;
      const t2 = match.team2?.title || `#${match.team2Id}`;
      const league = leagueTitle || 'Лига';
      const place = stadiumName || '—';
      const when = ruDateTime(match.date);

      const P = (text, opts = {}) =>
        new Paragraph({ children: [new TextRun(String(text || ''))], ...opts });

      const noBorders = {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      };

      // берём из заявки лиги; если пусто — из опубликованного состава матча; если и там пусто — все игроки команды
      const fallbackRows = (arr = []) =>
        arr.map((p) => ({
          number: p.number ?? '',
          name: p.name ?? '',
        }));
      const asRows = (players) =>
        players.map((p) => ({
          number: p.number ?? '',
          name: p.name ?? '',
        }));

      const list1 = appRoster1.length
        ? asRows(appRoster1)
        : lineup1.length
        ? asRows(lineup1)
        : fallbackRows(team1Players);
      const list2 = appRoster2.length
        ? asRows(appRoster2)
        : lineup2.length
        ? asRows(lineup2)
        : fallbackRows(team2Players);

      const NUM_ROWS = 18; // минимум строк, как на образце

      const makeRosterTable = (players) => {
        const head = new TableRow({
          children: [
            new TableCell({ children: [P('№')] }),
            new TableCell({ children: [P('ФИО')] }),
          ],
        });

        const bodyFilled = players.map(
          (p, i) =>
            new TableRow({
              children: [
                new TableCell({ children: [P(String(i + 1))] }),
                new TableCell({ children: [P(p.name || ' ')] }),
              ],
            })
        );

        const needPad = Math.max(0, NUM_ROWS - players.length);
        const padded = Array.from(
          { length: needPad },
          (_, k) =>
            new TableRow({
              children: [
                new TableCell({
                  children: [P(String(players.length + k + 1))],
                }),
                new TableCell({ children: [P(' ')] }),
              ],
            })
        );

        return new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [head, ...bodyFilled, ...padded],
        });
      };

      // две колонки: заголовок = название команды, далее — таблица с игроками
      const leftCell = new TableCell({
        children: [
          P(t1, { alignment: AlignmentType.CENTER }),
          makeRosterTable(list1),
        ],
      });
      const rightCell = new TableCell({
        children: [
          P(t2, { alignment: AlignmentType.CENTER }),
          makeRosterTable(list2),
        ],
      });
      const twoCols = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: [leftCell, rightCell] })],
        borders: noBorders,
      });

      const sigLine = '________________________';
      const capsigs = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [P('Подпись капитана'), P(sigLine)] }),
              new TableCell({ children: [P('Подпись капитана'), P(sigLine)] }),
            ],
          }),
        ],
        borders: noBorders,
      });

      const refBlock = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [P('Главный судья:  ФИО')] }),
              new TableCell({ children: [P('Подпись'), P(sigLine)] }),
            ],
          }),
        ],
        borders: noBorders,
      });

      const header = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  P('Заявка на матч', { alignment: AlignmentType.LEFT }),
                ],
                borders: noBorders,
              }),
              new TableCell({
                children: [P(league, { alignment: AlignmentType.RIGHT })],
                borders: noBorders,
              }),
            ],
          }),
        ],
        borders: noBorders,
      });

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: { top: 720, right: 720, bottom: 720, left: 720 },
              },
            },
            children: [
              header,
              P(' '),
              P(`Место проведения: ${place}`),
              P(`Дата проведения: ${when}`),
              P(' '),
              twoCols,
              P(' '),
              capsigs,
              P(' '),
              refBlock,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `match_${match.id}_application.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Не удалось сформировать заявку (DOCX). Проверь пакет "docx".');
    } finally {
      setLoading(false);
    }
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
    if (e.issuedByReferee?.name) return e.issuedByReferee.name;
    if (e.referee?.name) return e.referee.name;
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

  // Загрузка событий + пересчёт счёта
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
    const { s1, s2 } = calcScoreFromEvents(list);
    setScore1(s1);
    setScore2(s2);
    onScoreChanged?.(match.id, { team1Score: s1, team2Score: s2 });
  }

  const calcScoreFromEvents = (list) => {
    const goals = new Map();
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
          loadLeagueRosters(),
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

        issuedByRefereeId: refId, // разные варианты для совместимости
        refereeId: refId,
        issued_by_referee_id: refId,
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

  async function downloadOfficialProtocolDocx() {
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
        AlignmentType,
        BorderStyle,
      } = docx;

      const league = leagueTitle || 'Лига';
      const place = stadiumName || '—';
      const when = ruDateTime(match.date);
      const t1 = match.team1?.title || `#${match.team1Id}`;
      const t2 = match.team2?.title || `#${match.team2Id}`;

      const P = (text, opts = {}) =>
        new Paragraph({ children: [new TextRun(String(text || ''))], ...opts });
      const noBorders = {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      };

      // источник игроков: заявка лиги → опубликованный состав → все игроки команды
      const listOr = (pref, alt1, alt2) =>
        pref?.length ? pref : alt1?.length ? alt1 : alt2 || [];
      const L1 = listOr(appRoster1, lineup1, team1Players).map((p) => ({
        id: p.id,
        name: p.name,
        number: p.number,
      }));
      const L2 = listOr(appRoster2, lineup2, team2Players).map((p) => ({
        id: p.id,
        name: p.name,
        number: p.number,
      }));

      const MIN_ROWS = 14;

      const makeRosterTable = (title, arr) => {
        const head = new TableRow({
          children: [
            new TableCell({ children: [P('№')] }),
            new TableCell({ children: [P('ФИО')] }),
            new TableCell({ children: [P('Голы\n(мин)')] }),
            new TableCell({ children: [P('Передачи\n(мин)')] }),
          ],
        });

        const body = arr.map(
          (p, i) =>
            new TableRow({
              children: [
                new TableCell({ children: [P(String(i + 1))] }),
                new TableCell({ children: [P(p.name || ' ')] }),
                new TableCell({
                  children: [P(minsStr(goalsBy.get(p.id)) || ' ')],
                }),
                new TableCell({
                  children: [P(minsStr(assistsBy.get(p.id)) || ' ')],
                }),
              ],
            })
        );

        const pad = Math.max(0, MIN_ROWS - arr.length);
        const padded = Array.from(
          { length: pad },
          (_, k) =>
            new TableRow({
              children: [
                new TableCell({ children: [P(String(arr.length + k + 1))] }),
                new TableCell({ children: [P(' ')] }),
                new TableCell({ children: [P(' ')] }),
                new TableCell({ children: [P(' ')] }),
              ],
            })
        );

        // заголовок таблицы – название команды
        return [
          P(title, { alignment: AlignmentType.CENTER }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [head, ...body, ...padded],
          }),
        ];
      };

      // Шапка: «Протокол матча» слева и название лиги справа
      const header = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  P('Протокол матча', { alignment: AlignmentType.LEFT }),
                ],
                borders: noBorders,
              }),
              new TableCell({
                children: [P(league, { alignment: AlignmentType.RIGHT })],
                borders: noBorders,
              }),
            ],
          }),
        ],
        borders: noBorders,
      });

      // Блок "Место / Дата"
      const placeDate = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [P(`Место проведения:\n${place}`)] }),
              new TableCell({
                children: [
                  P(`Дата проведения:\n${when}`, {
                    alignment: AlignmentType.RIGHT,
                  }),
                ],
              }),
            ],
          }),
        ],
        borders: noBorders,
      });

      // Две колонки со списками
      const twoCols = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [...makeRosterTable(t1, L1)] }),
              new TableCell({ children: [...makeRosterTable(t2, L2)] }),
            ],
          }),
        ],
        borders: noBorders,
      });

      // Результат
      const result = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [P('Результат', { alignment: AlignmentType.CENTER })],
                borders: noBorders,
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({
                children: [P(`${t1}`, { alignment: AlignmentType.LEFT })],
                borders: noBorders,
              }),
              new TableCell({
                children: [
                  P(String(Number(score1) || 0), {
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableCell({
                children: [P(':', { alignment: AlignmentType.CENTER })],
              }),
              new TableCell({
                children: [
                  P(String(Number(score2) || 0), {
                    alignment: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableCell({
                children: [P(`${t2}`, { alignment: AlignmentType.LEFT })],
                borders: noBorders,
              }),
            ],
          }),
        ],
        borders: noBorders,
      });

      const line = '______________________________';

      // Оценки и подписи (две колонки)
      const grades = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [P('Лучший игрок матча:  ' + line)],
                columnSpan: 2,
              }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ children: [P('Оценка за судейство  ' + line)] }),
              new TableCell({ children: [P('Оценка за судейство  ' + line)] }),
            ],
          }),
          new TableRow({
            children: [
              new TableCell({ children: [P('Подпись капитана  ' + line)] }),
              new TableCell({ children: [P('Подпись капитана  ' + line)] }),
            ],
          }),
        ],
        borders: noBorders,
      });

      const chiefRef = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({ children: [P('Главный судья:  ФИО')] }),
              new TableCell({
                children: [
                  P('Подпись  ' + line, { alignment: AlignmentType.RIGHT }),
                ],
              }),
            ],
          }),
        ],
        borders: noBorders,
      });

      // Примечание: 3 строки
      const note = [
        P('Примечание:'),
        P(
          '________________________________________________________________________________'
        ),
        P(
          '________________________________________________________________________________'
        ),
        P(
          '________________________________________________________________________________'
        ),
      ];

      const doc = new Document({
        sections: [
          {
            properties: {
              page: {
                margin: { top: 720, right: 720, bottom: 720, left: 720 },
              },
            },
            children: [
              header,
              P(' '),
              placeDate,
              P(' '),
              twoCols,
              P(' '),
              result,
              P(' '),
              grades,
              P(' '),
              chiefRef,
              P(' '),
              ...note,
            ],
          },
        ],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `match_${match.id}_protocol_official.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Не удалось сформировать протокол (DOCX).');
    } finally {
      setLoading(false);
    }
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
    const map = new Map();
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
      if (a.rc !== b.rc) return a.rc - b.rc;
      if (a.yc !== b.yc) return a.yc - b.yc;
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
      <div className="modal__backdrop" />
      <div className="modal__dialog live-modal__dialog">
        <div className="modal__header">
          <h3 className="modal__title">
            Проведение матча: {match.team1?.title || `#${match.team1Id}`} —{' '}
            {match.team2?.title || `#${match.team2Id}`}
          </h3>
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
                <button className="btn btn" onClick={startPause}>
                  {running ? 'Пауза' : 'Старт'}
                </button>
                <button className="btn" onClick={finishHalf}>
                  Завершить тайм
                </button>

                <div className="scoreboard__nav">
                  <button
                    className="btn btn"
                    onClick={prevHalf}
                    disabled={currentHalf <= 1}
                  >
                    ← Пред. тайм
                  </button>
                  <button
                    className="btn btn"
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

            {/* Правая панель */}
            <SidePanel side={2} />
          </div>

          {/* Хронология */}
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
                                className="btn btn--xs "
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
                                className="btn btn--xs btn"
                                onClick={cancelEditEvent}
                              >
                                Отмена
                              </button>
                              <button
                                className="btn btn--xs "
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
                    className="btn btn--sm btn"
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
              <button className="btn btn" onClick={downloadApplicationDocx}>
                Заявка (DOCX)
              </button>
              <button className="btn " onClick={finishMatch} disabled={loading}>
                Завершить матч
              </button>
              <div className="spacer" />
              <button className="btn" onClick={onClose}>
                Закрыть
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn--ghost"
                onClick={downloadOfficialProtocolDocx}
              >
                Протокол (DOCX)
              </button>
              <button className="btn btn" onClick={downloadApplicationDocx}>
                Заявка (DOCX)
              </button>
              <button className="btn" onClick={downloadReportDocx}>
                Скачать DOCX
              </button>
              <button className="btn btn" onClick={() => setShowMvp((v) => !v)}>
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

/* ===================== Модалка: Редактирование матча ===================== */
function EditMatchModal({
  match, // { id, leagueId, date, status, team1Id, team2Id, stadiumId, team1Score, team2Score }
  teams,
  stadiums,
  referees, // 👈 список всех судей
  onClose,
  onSaved, // (updatedMatch) => void
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [form, setForm] = useState({
    date: match.date ? new Date(match.date).toISOString().slice(0, 16) : '',
    status: match.status || 'SCHEDULED',
    team1Id: String(match.team1Id || ''),
    team2Id: String(match.team2Id || ''),
    stadiumId: match.stadiumId ? String(match.stadiumId) : '',
    team1Score: match.team1Score ?? 0,
    team2Score: match.team2Score ?? 0,
  });

  // 👇 судьи текущего матча
  const [refRows, setRefRows] = useState([
    // { role: 'MAIN', refereeId: '' }
  ]);

  // загрузка назначенных судей
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_MATCHES}/${match.id}/referees`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        const list =
          (Array.isArray(data) ? data : []).map((r) => ({
            role: r.role || '',
            refereeId: String(r.refereeId),
          })) || [];
        setRefRows(list.length ? list : [{ role: 'MAIN', refereeId: '' }]);
      } catch {
        setRefRows([{ role: 'MAIN', refereeId: '' }]);
      }
    })();
  }, [match.id]);

  const addRefRow = () =>
    setRefRows((s) => [...s, { role: '', refereeId: '' }]);
  const rmRefRow = (i) => setRefRows((s) => s.filter((_, idx) => idx !== i));
  const setRefRole = (i, role) =>
    setRefRows((s) => s.map((r, idx) => (idx === i ? { ...r, role } : r)));
  const setRefId = (i, refereeId) =>
    setRefRows((s) => s.map((r, idx) => (idx === i ? { ...r, refereeId } : r)));

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((s) => ({ ...s, [name]: value }));
  };

  async function save() {
    try {
      setErr('');
      setLoading(true);

      if (!form.team1Id || !form.team2Id)
        throw new Error('Выберите обе команды');
      if (form.team1Id === form.team2Id)
        throw new Error('Команды не должны совпадать');

      const payload = {
        date: form.date ? new Date(form.date).toISOString() : null,
        status: form.status || 'SCHEDULED',
        team1Id: Number(form.team1Id),
        team2Id: Number(form.team2Id),
        stadiumId: form.stadiumId ? Number(form.stadiumId) : null,
        team1Score: Number(form.team1Score) || 0,
        team2Score: Number(form.team2Score) || 0,
      };

      // 1) обновляем матч
      const res = await fetch(`${API_MATCHES}/${match.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      // 2) сохраняем судей (полная замена)
      const clean = refRows
        .filter((r) => r.refereeId)
        .map((r) => ({
          refereeId: Number(r.refereeId),
          role: r.role || null,
        }));

      const res2 = await fetch(`${API_MATCHES}/${match.id}/referees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clean),
      });
      const d2 = await res2.json().catch(() => ({}));
      if (!res2.ok) throw new Error(d2?.error || `HTTP ${res2.status}`);

      onSaved?.(data);
      onClose?.();
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось сохранить матч');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__dialog">
        <div className="modal__header">
          <h3 className="modal__title">Редактирование матча #{match.id}</h3>
          <button className="btn btn" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal__body">
          {err && <div className="alert alert--error">{err}</div>}
          <div className="form">
            <div className="form__row">
              <label className="field">
                <span className="field__label">Дата/время</span>
                <input
                  className="input"
                  type="datetime-local"
                  name="date"
                  value={form.date}
                  onChange={onChange}
                />
              </label>

              <label className="field">
                <span className="field__label">Статус</span>
                <select
                  className="input"
                  name="status"
                  value={form.status}
                  onChange={onChange}
                >
                  <option value="SCHEDULED">SCHEDULED</option>
                  <option value="LIVE">LIVE</option>
                  <option value="FINISHED">FINISHED</option>
                  <option value="POSTPONED">POSTPONED</option>
                  <option value="CANCELED">CANCELED</option>
                </select>
              </label>
            </div>

            <div className="form__row">
              <label className="field">
                <span className="field__label">Хозяева</span>
                <select
                  className="input"
                  name="team1Id"
                  value={form.team1Id}
                  onChange={onChange}
                >
                  <option value="">—</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} (#{t.id})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Гости</span>
                <select
                  className="input"
                  name="team2Id"
                  value={form.team2Id}
                  onChange={onChange}
                >
                  <option value="">—</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} (#{t.id})
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Стадион</span>
                <select
                  className="input"
                  name="stadiumId"
                  value={form.stadiumId}
                  onChange={onChange}
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
                  name="team1Score"
                  type="number"
                  min={0}
                  value={form.team1Score}
                  onChange={onChange}
                />
              </label>
              <label className="field">
                <span className="field__label">Счёт гостей</span>
                <input
                  className="input"
                  name="team2Score"
                  type="number"
                  min={0}
                  value={form.team2Score}
                  onChange={onChange}
                />
              </label>
            </div>

            {/* ---------- Судьи матча ---------- */}
            <div className="form__block">
              <div className="form__block-title">Судьи матча</div>
              {refRows.map((row, i) => (
                <div className="form__row" key={`ref-${i}`}>
                  <label className="field">
                    <span className="field__label">Роль</span>
                    <select
                      className="input"
                      value={row.role}
                      onChange={(e) => setRefRole(i, e.target.value)}
                    >
                      <option value="">—</option>
                      {REF_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {REF_ROLE_LABEL[r] || r}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field field--grow">
                    <span className="field__label">Судья</span>
                    <select
                      className="input"
                      value={row.refereeId}
                      onChange={(e) => setRefId(i, e.target.value)}
                    >
                      <option value="">—</option>
                      {referees.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="field field--inline-actions">
                    <button
                      type="button"
                      className="btn btn"
                      onClick={() => rmRefRow(i)}
                      title="Удалить"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <div className="form__actions">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={addRefRow}
                >
                  + Добавить судью
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal__footer">
          <button
            className="btn btn--primary"
            onClick={save}
            disabled={loading}
          >
            Сохранить
          </button>
          <div className="spacer" />
          <button className="btn btn" onClick={onClose}>
            Отмена
          </button>
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
  const [referees, setReferees] = useState([]); // 👈 справочник судей
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  async function loadLeagueInfo() {
    const res = await fetch(`${API_LEAGUES}/${leagueId}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setLeague(data || null);
  }

  // === Календарь JPG ===
  const [showCalModal, setShowCalModal] = useState(false);
  const [calDate, setCalDate] = useState(''); // YYYY-MM-DD
  const posterRef = useRef(null);
  const [posterData, setPosterData] = useState(null);
  const [posterMode, setPosterMode] = useState('cal'); // {titleDay,titleVenue,matches,season}
  const [topRound, setTopRound] = useState('');

  async function downloadTopScorersJPG(roundNo) {
    // 1) Матчи для отчёта
    const finished = matches.filter((m) => m.status === 'FINISHED');
    const list = finished.filter((m) => {
      // если в матчах есть поле round/tour — используем его; иначе берём все
      if (!roundNo) return true;
      const r = m.round ?? m.tour ?? m.matchday ?? null;
      return Number(r) === Number(roundNo);
    });
    if (!list.length) {
      alert('Нет завершённых матчей для выбранного набора.');
      return;
    }

    // 2) Тянем события (с игроками) и участников
    const getJSON = async (url) => {
      const r = await fetch(url);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`);
      return d;
    };

    // по одному запросу на матч — самый совместимый способ
    const eventsByMatch = await Promise.all(
      list.map((m) =>
        getJSON(
          `${API_EVENTS}?` +
            new URLSearchParams({
              range: JSON.stringify([0, 999]),
              sort: JSON.stringify(['id', 'ASC']),
              filter: JSON.stringify({ matchId: m.id }),
            }) +
            `&include=player,team`
        ).then((arr) => ({ id: m.id, events: Array.isArray(arr) ? arr : [] }))
      )
    );

    const participantsByMatch = await Promise.all(
      list.map((m) =>
        getJSON(`${API_MATCHES}/${m.id}/participants?include=player`).then(
          (arr) => ({ id: m.id, parts: Array.isArray(arr) ? arr : [] })
        )
      )
    );

    // 3) Агрегируем
    const goals = new Map(); // playerId -> count
    const games = new Map(); // playerId -> Set<matchId>
    const pinfo = new Map(); // playerId -> { name, teamTitle, photo }

    const mergePinfo = (pid, patch) => {
      const prev = pinfo.get(pid) || {};
      pinfo.set(pid, { ...prev, ...patch });
    };

    for (const { id: matchId, events } of eventsByMatch) {
      for (const e of events) {
        if (e.type === 'GOAL' || e.type === 'PENALTY_SCORED') {
          const pid = Number(e.playerId);
          if (!pid) continue;
          goals.set(pid, (goals.get(pid) || 0) + 1);
          // инфо игрока
          const name =
            e.player?.name ??
            (e.player &&
              (e.player.surname
                ? `${e.player.name} ${e.player.surname}`
                : e.player.name)) ??
            '';
          const teamId = e.teamId ?? e.team?.id ?? null;
          const t = teamId ? teamById(teams, teamId) : null;
          const teamTitle = e.team?.title ?? t?.title ?? '';
          const teamLogoUrl = t ? teamLogo(t) : '';
          const photo = playerPhoto(e.player);
          mergePinfo(pid, {
            name,
            teamId,
            teamTitle,
            teamLogo: teamLogoUrl,
            photo,
          });
        }
      }
    }

    for (const { id: matchId, parts } of participantsByMatch) {
      const seen = new Set();
      for (const pm of parts) {
        const pid = pm.playerId ?? pm.player?.id;
        if (!pid) continue;
        if (!games.has(pid)) games.set(pid, new Set());
        games.get(pid).add(matchId);
        const name = pm.player?.name ?? '';
        const teamId = pm.player?.teamId ?? pm.teamId ?? null;
        const t = teamId ? teamById(teams, teamId) : null;
        const teamTitle = t?.title ?? '';
        const teamLogoUrl = t ? teamLogo(t) : '';
        const photo = playerPhoto(pm.player);
        mergePinfo(pid, {
          name,
          teamId,
          teamTitle,
          teamLogo: teamLogoUrl,
          photo,
        });
        seen.add(pid);
      }
    }

    // Фолбэк: если участников нет — игры = количество матчей, где игрок забивал
    if (![...games.values()].length) {
      for (const [pid] of goals) {
        const s = new Set();
        for (const { id: matchId, events } of eventsByMatch) {
          if (events.some((e) => Number(e.playerId) === Number(pid)))
            s.add(matchId);
        }
        games.set(pid, s);
      }
    }

    // 4) TOP-5
    const rows = [...goals.entries()]
      .map(([pid, g]) => {
        const info = pinfo.get(pid) || {};
        return {
          playerId: pid,
          name: info.name || `#${pid}`,
          teamTitle: info.teamTitle || '',
          teamLogo:
            info.teamLogo ||
            (info.teamId ? teamLogo(teamById(teams, info.teamId)) : ''),
          photo: info.photo || '',
          goals: g,
          games: games.get(pid)?.size || 0,
        };
      })
      .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name, 'ru'))
      .slice(0, 5);

    if (!rows.length) {
      alert('Не найдено голов для отчёта.');
      return;
    }

    // 5) Рендер и сохранение
    const seasonYear = new Date(list[0].date || Date.now()).getFullYear();
    const roundLabel = roundNo ? `${roundNo} ТУР` : '';

    const season = league?.season ?? seasonYear;

    setPosterMode('top');
    setPosterData({
      season, // ← берём из БД, иначе год из даты
      roundLabel,
      rows,
    });

    await new Promise((r) => setTimeout(r, 0)); // дождаться рендера

    // ждём загрузки изображений внутри постера
    await new Promise((resolve) => {
      const imgs = posterRef.current?.querySelectorAll('img') || [];
      if (!imgs.length) return resolve();
      let left = imgs.length;
      imgs.forEach((img) => {
        if (img.complete) {
          if (--left === 0) resolve();
        } else {
          const done = () => {
            img.onload = img.onerror = null;
            if (--left === 0) resolve();
          };
          img.onload = done;
          img.onerror = done;
        }
      });
    });

    const { toJpeg } = await import('html-to-image');
    const opts = {
      pixelRatio: 2,
      quality: 0.95,
      skipFonts: true,
      cacheBust: true,
    };
    const dataUrl = await toJpeg(posterRef.current, opts);

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `top_scorers_${
      roundNo ? `round${roundNo}_` : ''
    }${season}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setPosterData(null);
  }

  // helpers: teamById, teamLogo, fmtDDMMMM — как у тебя в календаре
  function buildResultsPosterData(matches, teams, stadiums, dateStr) {
    if (!dateStr) return null;
    const dayStart = new Date(`${dateStr}T00:00:00`);
    const dayEnd = new Date(`${dateStr}T23:59:59`);

    const dayMatches = (matches || []).filter((m) => {
      const d = new Date(m.date);
      return d >= dayStart && d <= dayEnd;
    });
    if (!dayMatches.length) return null;

    const venues = [
      ...new Set(
        dayMatches
          .map((m) => stadiums.find((s) => s.id === m.stadiumId)?.name)
          .filter(Boolean)
      ),
    ];

    const rows = dayMatches.map((m) => {
      const h = teamById(teams, m.team1Id);
      const a = teamById(teams, m.team2Id);
      const s1 = Number(m.team1Score ?? 0);
      const s2 = Number(m.team2Score ?? 0);
      return {
        home: { name: h?.title || `#${m.team1Id}`, logo: teamLogo(h) },
        away: { name: a?.title || `#${m.team2Id}`, logo: teamLogo(a) },
        score: `${s1}-${s2}`,
      };
    });

    return {
      season: new Date(dayMatches[0].date).getFullYear(),
      titleDay: fmtDDMMMM(dayMatches[0].date),
      titleVenue: venues.join(', ') || '—',
      matches: rows,
    };
  }

  function calcStandings(allMatches, allTeams, roundLimit = null) {
    const init = (t) => ({
      teamId: t.id,
      title: t.title || `#${t.id}`,
      logo: teamLogo(t),
      played: 0,
      w: 0,
      d: 0,
      l: 0,
      gf: 0,
      ga: 0,
      pts: 0,
      diff: 0,
    });

    const byId = new Map(allTeams.map((t) => [t.id, init(t)]));

    const finished = allMatches.filter((m) => {
      if (m.status !== 'FINISHED') return false;
      if (roundLimit == null) return true;
      const r = m.round ?? m.tour ?? m.matchday ?? null;
      return r != null ? Number(r) <= Number(roundLimit) : true;
    });

    for (const m of finished) {
      const t1 = byId.get(m.team1Id) || init(teamById(allTeams, m.team1Id));
      const t2 = byId.get(m.team2Id) || init(teamById(allTeams, m.team2Id));
      byId.set(m.team1Id, t1);
      byId.set(m.team2Id, t2);

      const s1 = Number(m.team1Score ?? 0);
      const s2 = Number(m.team2Score ?? 0);

      t1.played++;
      t2.played++;
      t1.gf += s1;
      t1.ga += s2;
      t2.gf += s2;
      t2.ga += s1;

      if (s1 > s2) {
        t1.w++;
        t2.l++;
        t1.pts += 3;
      } else if (s2 > s1) {
        t2.w++;
        t1.l++;
        t2.pts += 3;
      } else {
        t1.d++;
        t2.d++;
        t1.pts++;
        t2.pts++;
      }
    }

    const rows = [...byId.values()].map((r) => ({ ...r, diff: r.gf - r.ga }));
    rows.sort(
      (a, b) =>
        b.pts - a.pts ||
        b.diff - a.diff ||
        b.gf - a.gf ||
        a.title.localeCompare(b.title, 'ru')
    );

    return rows;
  }

  async function downloadStandingsJPG(roundNo = null) {
    const rows = calcStandings(matches, teams, roundNo);
    if (!rows.length) {
      alert('Нет данных для таблицы.');
      return;
    }

    setPosterMode('tbl');
    setPosterData({
      season: league?.season ?? new Date().getFullYear(), // красивый сезон из БД
      rows,
    });

    await new Promise((r) => setTimeout(r, 0));

    // дождаться загрузки логотипов
    await new Promise((resolve) => {
      const imgs = posterRef.current?.querySelectorAll('img') || [];
      if (!imgs.length) return resolve();
      let left = imgs.length;
      imgs.forEach((img) => {
        const done = () => (--left === 0 ? resolve() : null);
        img.complete ? done() : (img.onload = img.onerror = done);
      });
    });

    const { toJpeg } = await import('html-to-image');
    const dataUrl = await toJpeg(posterRef.current, {
      pixelRatio: 2,
      quality: 0.95,
      skipFonts: true,
      cacheBust: true,
    });

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `standings${roundNo ? `_round${roundNo}` : ''}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setPosterData(null);
  }

  // внутри твоего компонента, где есть posterRef и setPosterData
  async function downloadResultsJPG(dateStr) {
    setPosterMode('res');
    const data = buildResultsPosterData(matches, teams, stadiums, dateStr);
    if (!data) {
      alert('На выбранную дату матчей нет');
      return;
    }
    setPosterData(data); // показать постер
    await new Promise((r) => setTimeout(r, 0));

    const { toJpeg } = await import('html-to-image');
    const opts = {
      pixelRatio: 2,
      quality: 0.95,
      skipFonts: true,
      cacheBust: true,
    };
    const dataUrl = await toJpeg(posterRef.current, opts);

    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `results_${dateStr}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setPosterData(null); // убрать постер из DOM
  }

  // Собираем данные для постера из матчей/команд/стадионов
  function buildPosterData(dateStr) {
    if (!dateStr) return null;
    const dayStart = new Date(dateStr + 'T00:00:00');
    const dayEnd = new Date(dateStr + 'T23:59:59');

    const dayMatches = (matches || []).filter((m) => {
      const d = new Date(m.date);
      return d >= dayStart && d <= dayEnd;
    });
    if (!dayMatches.length) return null;

    const venues = [
      ...new Set(
        dayMatches
          .map((m) => stadiums.find((s) => s.id === m.stadiumId)?.name)
          .filter(Boolean)
      ),
    ];

    const rows = dayMatches.map((m) => {
      const h = teams.find((t) => t.id === m.team1Id) || {};
      const a = teams.find((t) => t.id === m.team2Id) || {};
      return {
        time: fmtHM(m.date),
        home: { name: h.title || `#${m.team1Id}`, logo: teamLogo(h) },
        away: { name: a.title || `#${m.team2Id}`, logo: teamLogo(a) },
      };
    });

    return {
      titleDay: fmtDDMMMM(dayMatches[0].date),
      titleVenue: venues.join(', ') || '—',
      matches: rows,
      season: league?.season ?? new Date(dayMatches[0].date).getFullYear(),
    };
  }

  async function downloadCalendarJPG() {
    const data = buildPosterData(calDate);
    if (!data) {
      alert('На выбранную дату матчей нет');
      return;
    }
    setPosterData(data);
    await new Promise((r) => setTimeout(r, 0)); // дождаться рендера скрытого постера

    const { toJpeg } = await import('html-to-image');
    const opts = {
      pixelRatio: 2,
      quality: 0.95,
      skipFonts: true,
      cacheBust: true,
    };
    const dataUrl = await toJpeg(posterRef.current, opts);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `calendar_${calDate}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setPosterData(null);
  }

  const [showCreate, setShowCreate] = useState(false);

  const [form, setForm] = useState({
    date: '',
    team1Id: '',
    team2Id: '',
    stadiumId: '',
    team1Score: 0,
    team2Score: 0,
  });

  // 👇 судьи для формы создания
  const [createRefs, setCreateRefs] = useState([
    { role: 'MAIN', refereeId: '' },
  ]);

  const addCreateRef = () =>
    setCreateRefs((s) => [...s, { role: '', refereeId: '' }]);
  const rmCreateRef = (i) =>
    setCreateRefs((s) => s.filter((_, idx) => idx !== i));
  const setCreateRefRole = (i, role) =>
    setCreateRefs((s) => s.map((r, idx) => (idx === i ? { ...r, role } : r)));
  const setCreateRefId = (i, refereeId) =>
    setCreateRefs((s) =>
      s.map((r, idx) => (idx === i ? { ...r, refereeId } : r))
    );

  const resetForm = () => {
    setForm({
      date: '',
      team1Id: '',
      team2Id: '',
      stadiumId: '',
      team1Score: 0,
      team2Score: 0,
    });
    setCreateRefs([{ role: 'MAIN', refereeId: '' }]);
  };

  const [liveMatch, setLiveMatch] = useState(null);
  const [editMatch, setEditMatch] = useState(null);

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
  async function loadReferees() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 499]),
      sort: JSON.stringify(['name', 'ASC']),
      filter: JSON.stringify({}),
    });
    const res = await fetch(`${API_REFS}?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setReferees(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([
          loadMatches(),
          loadLeagueTeams(),
          loadStadiums(),
          loadReferees(), // 👈 тянем список судей
          loadLeagueInfo(),
        ]);
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
        date: form.date
          ? new Date(form.date).toISOString()
          : new Date().toISOString(),
        team1Id: Number(form.team1Id),
        team2Id: Number(form.team2Id),
        stadiumId: form.stadiumId ? Number(form.stadiumId) : null,
        status: 'SCHEDULED',
        team1Score: Number(form.team1Score) || 0,
        team2Score: Number(form.team2Score) || 0,
        // 👇 сразу прикрепляем судей
        matchReferees: createRefs
          .filter((r) => r.refereeId)
          .map((r) => ({
            refereeId: Number(r.refereeId),
            role: r.role || null,
          })),
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

  function applyUpdatedMatch(updated) {
    setMatches((list) =>
      list.map((m) => (m.id === updated.id ? { ...m, ...updated } : m))
    );
  }

  const teamName = (id) => teams.find((t) => t.id === id)?.title || `#${id}`;

  const patchMatchScore = (matchId, { team1Score, team2Score }) => {
    setMatches((list) =>
      list.map((m) => (m.id === matchId ? { ...m, team1Score, team2Score } : m))
    );
  };

  return (
    <div className="grid onecol">
      <div
        className="toolbar"
        style={{ display: 'flex', gap: '20px', marginTop: '20px' }}
      >
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
        <button
          className="btn btn--ghost"
          onClick={() => {
            const d = matches[0]?.date ? new Date(matches[0].date) : new Date();
            setCalDate(d.toISOString().slice(0, 10));
            setPosterMode('cal'); // ✅
            setShowCalModal(true);
          }}
        >
          Календарь (JPG)
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => {
            const d = matches.find((m) => m.status === 'FINISHED')?.date
              ? new Date(matches.find((m) => m.status === 'FINISHED').date)
              : matches[0]?.date
              ? new Date(matches[0].date)
              : new Date();
            setCalDate(d.toISOString().slice(0, 10));
            setPosterMode('res');
            setShowCalModal(true);
          }}
        >
          Результаты (JPG)
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => {
            setPosterMode('top');
            setTopRound('');
            setShowCalModal(true);
          }}
        >
          Топ-5 бомбардиров (JPG)
        </button>
        <button
          className="btn btn--ghost"
          onClick={() => {
            setPosterMode('tbl');
            setTopRound(''); // можно использовать тот же state, что и для ТОП-5
            setShowCalModal(true);
          }}
        >
          Турнирная таблица (JPG)
        </button>
      </div>
      {showCalModal && (
        <div
          className="modal"
          onClick={() => setShowCalModal(false)}
          style={{
            display: 'flex',
            width: '500px',
            margin: '40px',
            padding: '20px',
            gap: '20px',
            border: '1px solid #000',
          }}
        >
          <div className="modal__backdrop" />
          <div className="modal__dialog" onClick={(e) => e.stopPropagation()}>
            <div
              className="modal__header"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '20px',
              }}
            >
              {/* <h3 className="modal__title">Скачать календарь за день</h3> */}
              <h3 className="modal__title">
                {posterMode === 'cal'
                  ? 'Скачать календарь за день'
                  : posterMode === 'res'
                  ? 'Скачать результаты за день'
                  : posterMode === 'top'
                  ? 'Скачать ТОП-5 бомбардиров'
                  : 'Скачать турнирную таблицу'}
              </h3>
              <button
                // className="btn btn--ghost"
                onClick={() => setShowCalModal(false)}
                style={{ width: '20px', fontSize: '16px' }}
              >
                ×
              </button>
            </div>
            <div className="modal__body">
              {['cal', 'res'].includes(posterMode) ? (
                <label className="field">
                  <span className="field__label">Дата</span>
                  <input
                    className="input"
                    type="date"
                    value={calDate}
                    onChange={(e) => setCalDate(e.target.value)}
                    style={{ width: '400px' }}
                  />
                </label>
              ) : (
                <label className="field">
                  <span className="field__label">Номер тура (опционально)</span>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={topRound}
                    onChange={(e) => setTopRound(e.target.value)}
                    placeholder="например: 7"
                  />
                </label>
              )}
            </div>

            <div
              className="modal__footer"
              style={{ display: 'flex', gap: '20px', marginTop: '20px' }}
            >
              <button
                className="btn "
                onClick={
                  posterMode === 'cal'
                    ? downloadCalendarJPG
                    : posterMode === 'res'
                    ? () => downloadResultsJPG(calDate)
                    : posterMode === 'top'
                    ? () => downloadTopScorersJPG(topRound || null)
                    : () => downloadStandingsJPG(topRound || null) // режим 'tbl'
                }
              >
                Скачать JPG
              </button>
              <div className="spacer" />
              <button className="btn" onClick={() => setShowCalModal(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
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
                  required
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
                  required
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

            {/* ---------- Судьи матча (создание) ---------- */}
            <div className="form__block">
              <div className="form__block-title">Судьи матча</div>
              {createRefs.map((row, i) => (
                <div className="form__row" key={`c-ref-${i}`}>
                  <label className="field">
                    <span className="field__label">Роль</span>
                    <select
                      className="input"
                      value={row.role}
                      onChange={(e) => setCreateRefRole(i, e.target.value)}
                    >
                      <option value="">—</option>
                      {REF_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {REF_ROLE_LABEL[r] || r}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field field--grow">
                    <span className="field__label">Судья</span>
                    <select
                      className="input"
                      value={row.refereeId}
                      onChange={(e) => setCreateRefId(i, e.target.value)}
                    >
                      <option value="">—</option>
                      {referees.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="field field--inline-actions">
                    <button
                      type="button"
                      className="btn btn"
                      onClick={() => rmCreateRef(i)}
                      title="Удалить"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              <div className="form__actions">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={addCreateRef}
                >
                  + Добавить судью
                </button>
              </div>
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
                className="btn btn"
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
                    Провести
                  </button>
                  <button
                    className="btn btn--sm"
                    style={{ marginLeft: 6 }}
                    onClick={() => setEditMatch(m)}
                  >
                    Редактировать
                  </button>
                  <button
                    className="btn btn--sm "
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
      {/* Скачать кадендарь матчей */}
      <PosterCal
        posterRef={posterRef}
        posterData={posterMode === 'cal' ? posterData : null}
      />

      <PosterResults
        posterRef={posterRef}
        posterData={posterMode === 'res' ? posterData : null}
      />
      <PosterTop5
        posterRef={posterRef}
        posterData={posterMode === 'top' ? posterData : null}
      />

      <PosterTable
        posterRef={posterRef}
        posterData={posterMode === 'tbl' ? posterData : null}
      />
      {/* Скачать кадендарь матчей */}
      {liveMatch && (
        <LiveMatchModal
          match={liveMatch}
          onClose={() => setLiveMatch(null)}
          onScoreChanged={(id, score) => patchMatchScore(id, score)}
        />
      )}
      {editMatch && (
        <EditMatchModal
          match={editMatch}
          teams={teams}
          stadiums={stadiums}
          referees={referees} // 👈 передаем справочник
          onClose={() => setEditMatch(null)}
          onSaved={(upd) => {
            applyUpdatedMatch(upd);
            setEditMatch(null);
          }}
        />
      )}
    </div>
  );
}
