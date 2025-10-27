import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import serverConfig from '../../../serverConfig';
import uploadsConfig from '../../../uploadsConfig';
import classes from './PlayerStatsPage.module.css';

/* ===================== helpers ===================== */

// дата и время «DD МЕСЯЦ / HH:MM»
const fmtDate = (d) => {
  try {
    const dt = new Date(d);
    const date = dt
      .toLocaleDateString('ru-RU', { day: '2-digit', month: 'long' })
      .toUpperCase();
    const time = dt.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return { date, time };
  } catch {
    return { date: '', time: '' };
  }
};

const firstString = (...candidates) =>
  candidates.find((v) => typeof v === 'string' && v.trim())?.trim() || '';

// Универсальное название лиги
const getLeagueTitle = (m) =>
  firstString(
    m.league?.title,
    m.league?.name,
    m.leagueTitle,
    m.league_name,
    typeof m.league === 'string' ? m.league : ''
  );

// Универсальные ID команд
const getTeamId = (m, side /* 'home' | 'away' */) => {
  if (side === 'home') {
    return (
      m.homeTeamId ??
      m.home_team_id ??
      m.team1Id ??
      m.hostTeamId ??
      m.host_team_id ??
      m.homeTeam?.id ??
      m.home_team?.id ??
      m.team1?.id ??
      m.team1Obj?.id ??
      null
    );
  }
  return (
    m.guestTeamId ??
    m.guest_team_id ??
    m.team2Id ??
    m.awayTeamId ??
    m.away_team_id ??
    m.guestTeam?.id ??
    m.guest_team?.id ??
    m.team2?.id ??
    m.team2Obj?.id ??
    null
  );
};

// Название команды с учётом словаря teamsById
const getTeamName = (m, side /* 'home' | 'away' */, teamsById) => {
  if (side === 'home') {
    const fromMatch = firstString(
      m.homeTeam?.title,
      m.homeTeam?.name,
      m.home_team?.title,
      m.home_team?.name,
      m.team1?.title,
      m.team1?.name,
      m.team1Obj?.title,
      m.team1Obj?.name,
      m.hostTeam?.title,
      m.hostTeam?.name,
      m.host_team?.title,
      m.host_team?.name,
      m.homeTeamTitle,
      m.homeTeamName,
      m.team1Title,
      m.team1_name,
      m.hostTeamTitle,
      m.hostTeamName
    );
    if (fromMatch) return fromMatch;

    const id = getTeamId(m, 'home');
    if (id != null) {
      const rec = teamsById[Number(id)];
      if (rec) return rec.title || rec.name || `#${id}`;
      return `#${id}`;
    }
    return '—';
  } else {
    const fromMatch = firstString(
      m.guestTeam?.title,
      m.guestTeam?.name,
      m.guest_team?.title,
      m.guest_team?.name,
      m.team2?.title,
      m.team2?.name,
      m.team2Obj?.title,
      m.team2Obj?.name,
      m.awayTeam?.title,
      m.awayTeam?.name,
      m.away_team?.title,
      m.away_team?.name,
      m.guestTeamTitle,
      m.guestTeamName,
      m.team2Title,
      m.team2_name,
      m.awayTeamTitle,
      m.awayTeamName
    );
    if (fromMatch) return fromMatch;

    const id = getTeamId(m, 'away');
    if (id != null) {
      const rec = teamsById[Number(id)];
      if (rec) return rec.title || rec.name || `#${id}`;
      return `#${id}`;
    }
    return '—';
  }
};

// Универсальный счёт
const getScore = (m) => {
  const hs = [m.homeScore, m.team1Score, m.home_score].find(
    (v) => v !== undefined && v !== null
  );
  const gs = [m.guestScore, m.team2Score, m.guest_score].find(
    (v) => v !== undefined && v !== null
  );
  return hs != null && gs != null ? `${hs}:${gs}` : '';
};

// Типы событий
const GOAL_TYPES = new Set(['GOAL', 'PENALTY_SCORED']);
const ASSIST_TYPES = new Set(['ASSIST']);
const YC_TYPES = new Set(['YELLOW_CARD']);
const RC_TYPES = new Set(['RED_CARD']);

// Название матча «Хозяева X:Y Гости»
const buildMatchTitle = (row) => {
  const homeName = row.homeTeamName || '';
  const awayName = row.awayTeamName || '';
  const score = row.score ? ` ${row.score} ` : ' ';
  return `${homeName}${score}${awayName}`.trim();
};

/* ===================== component ===================== */

export default function PlayerStatsPage() {
  const { id } = useParams(); // /playerStats/:id

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [player, setPlayer] = useState(null);
  const [team, setTeam] = useState(null);

  const [rawStats, setRawStats] = useState([]); // агрегат на игрока (опционально)
  const [matches, setMatches] = useState([]); // матчи команды
  const [events, setEvents] = useState([]); // события игрока

  // Справочник команд: { [id]: { id, title, name, ... } }
  const [teamsById, setTeamsById] = useState({});

  // фильтры
  const [season, setSeason] = useState('ALL');
  const [year, setYear] = useState('ALL');

  // ===== загрузка базовых данных =====
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        // игрок
        const p = await axios.get(`${serverConfig}/players/${id}`);
        const pData = p?.data || null;
        if (alive) setPlayer(pData);

        // команда игрока
        if (pData?.teamId) {
          try {
            const t = await axios.get(`${serverConfig}/teams/${pData.teamId}`);
            if (alive) setTeam(t?.data || null);
          } catch {}
        }

        // агрегат игрока
        try {
          const s = await axios.get(`${serverConfig}/playerStats`, {
            params: { filter: JSON.stringify({ playerId: pData?.id }) },
          });
          if (alive) setRawStats(Array.isArray(s.data) ? s.data : []);
        } catch {}

        // матчи команды
        let m;
        try {
          if (pData?.teamId) {
            m = await axios.get(`${serverConfig}/matches`, {
              params: {
                filter: JSON.stringify({
                  OR: [
                    { homeTeamId: pData.teamId },
                    { guestTeamId: pData.teamId },
                  ],
                }),
              },
            });
          } else {
            m = await axios.get(`${serverConfig}/matches`);
          }
        } catch {
          m = await axios.get(`${serverConfig}/matches`);
        }
        const matchesArr = Array.isArray(m.data) ? m.data : [];
        if (alive) setMatches(matchesArr);

        // события игрока
        try {
          const ev = await axios.get(`${serverConfig}/matchEvents`, {
            params: { filter: JSON.stringify({ playerId: pData?.id }) },
          });
          if (alive) setEvents(Array.isArray(ev.data) ? ev.data : []);
        } catch {}

        // ===== подгрузка справочника команд (чтобы по id получить название) =====
        try {
          const teamsRes = await axios.get(`${serverConfig}/teams`);
          const arr = Array.isArray(teamsRes.data) ? teamsRes.data : [];
          const map = {};
          arr.forEach((t) => {
            if (t && t.id != null) map[Number(t.id)] = t;
          });
          if (alive) setTeamsById(map);
        } catch {
          if (alive) setTeamsById({});
        }
      } catch (e) {
        if (alive) setErr('Не удалось загрузить страницу игрока');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  // годы для фильтра
  const yearsList = useMemo(() => {
    const setYears = new Set();
    (matches || []).forEach((m) => {
      if (m?.date) setYears.add(new Date(m.date).getFullYear());
    });
    const arr = Array.from(setYears).sort((a, b) => b - a);
    return ['ALL', ...arr];
  }, [matches]);

  // сезоны для фильтра
  const seasonsList = useMemo(() => {
    const s = new Set();
    (matches || []).forEach((m) => {
      if (!m?.date) return;
      const y = new Date(m.date).getFullYear();
      s.add(`${y}/${String((y + 1) % 100).padStart(2, '0')}`);
    });
    const arr = Array.from(s).sort((a, b) => (a > b ? -1 : 1));
    return ['ALL', ...arr];
  }, [matches]);

  // события игрока: /matchEvents или собранные из include в матчах
  const playerEvents = useMemo(() => {
    if (Array.isArray(events) && events.length) return events;
    const out = [];
    (matches || []).forEach((m) => {
      (m?.events || []).forEach((ev) => {
        if (ev?.playerId === player?.id) {
          out.push({ ...ev, matchId: ev.matchId || m.id });
        }
      });
    });
    return out;
  }, [events, matches, player?.id]);

  // строки статистики по матчам (здесь подставляем названия команд через teamsById)
  const computedStatsRows = useMemo(() => {
    // сгруппировать события по matchId
    const byMatch = new Map();
    (playerEvents || []).forEach((ev) => {
      const mid = ev.matchId;
      if (!mid) return;
      const arr = byMatch.get(mid) || [];
      arr.push(ev);
      byMatch.set(mid, arr);
    });

    const rows = [];
    (matches || []).forEach((m) => {
      const evs = byMatch.get(m.id) || [];
      if (!evs.length) return; // нет событий игрока — пропускаем

      const date = m.date || null;
      const league = getLeagueTitle(m) || '—';

      const homeId = getTeamId(m, 'home');
      const awayId = getTeamId(m, 'away');
      const homeTeamName = getTeamName(m, 'home', teamsById);
      const awayTeamName = getTeamName(m, 'away', teamsById);

      const isHome = Number(homeId) === Number(team?.id);

      let goals = 0,
        pens = 0,
        assists = 0,
        yellow = 0,
        red = 0;
      evs.forEach((ev) => {
        const type = ev.type;
        if (GOAL_TYPES.has(type)) {
          goals += 1;
          if (type === 'PENALTY_SCORED') pens += 1;
        }
        if (ASSIST_TYPES.has(type)) assists += 1;
        if (YC_TYPES.has(type)) yellow += 1;
        if (RC_TYPES.has(type)) red += 1;
      });

      const score = getScore(m);

      // сезонная строка
      let seasonStr = null;
      if (date) {
        const y = new Date(date).getFullYear();
        seasonStr = `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
      }

      rows.push({
        matchId: m.id,
        league,
        opponent: isHome ? awayTeamName : homeTeamName,
        date,
        goals,
        pens,
        assists,
        yellow,
        red,
        minutes: null,
        score,
        season: seasonStr,
        teamName: team?.title || '',
        home: isHome,
        homeTeamName,
        awayTeamName,
      });
    });

    return rows.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [matches, playerEvents, team?.id, team?.title, teamsById]);

  // применяем фильтры
  const filteredRows = useMemo(() => {
    return (computedStatsRows || []).filter((r) => {
      if (season !== 'ALL' && r.season && r.season !== season) return false;
      if (year !== 'ALL' && r.date) {
        const y = new Date(r.date).getFullYear();
        if (String(y) !== String(year)) return false;
      }
      return true;
    });
  }, [computedStatsRows, season, year]);

  // итоги
  const totals = useMemo(() => {
    const games = filteredRows.length;
    const goals = filteredRows.reduce((s, r) => s + (r.goals || 0), 0);
    const pens = filteredRows.reduce((s, r) => s + (r.pens || 0), 0);
    const assists = filteredRows.reduce((s, r) => s + (r.assists || 0), 0);
    const yellow = filteredRows.reduce((s, r) => s + (r.yellow || 0), 0);
    const red = filteredRows.reduce((s, r) => s + (r.red || 0), 0);
    return { games, goals, pens, assists, yellow, red };
  }, [filteredRows]);

  /* ===================== render ===================== */

  if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;
  if (err || !player)
    return <div style={{ padding: 16 }}>{err || 'Игрок не найден'}</div>;

  const avatar =
    Array.isArray(player.images) && player.images[0]
      ? `${uploadsConfig}${player.images[0]}`
      : null;

  const birth = player.birthDate || player.birthday;
  const birthStr = birth
    ? new Date(birth).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';

  return (
    <div className={classes.page}>
      <div className={classes.pageBlock}>
        {/* ====== TOP CARD ====== */}
        <div className={classes.hero}>
          <div className={classes.heroLeft}>
            {avatar ? (
              <img
                src={avatar}
                alt={player.name}
                className={classes.photo}
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            ) : (
              <img
                src={'/images/bgPlCard.png'}
                alt={player.name}
                loading="lazy"
                onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                className={classes.photo}
              />
            )}
          </div>
          <div className={classes.heroRight}>
            <img src="../images/Group 201.png" className={classes.red} alt="" />
            <div className={classes.nameBlock}>
              <div className={classes.playerName}>{player.name}</div>
            </div>
            <div className={classes.meta}>
              <div>
                <span>Дата рождения:</span>
                <span>{birthStr}</span>
              </div>
              <div>
                <span>Клуб:</span>
                <span>{team?.title || '—'}</span>
              </div>
            </div>
            <div className={classes.greenCard}>
              <div className={classes.metrics}>
                <div className={classes.metric}>
                  <div className={classes.metricTitle}>Игры</div>
                  <div className={classes.metricValue}>{totals.games}</div>
                </div>
                <div className={classes.metric}>
                  <div className={classes.metricTitle}>Голы</div>
                  <div className={classes.metricValue}>{totals.goals}</div>
                </div>
                <div className={classes.metric}>
                  <div className={classes.metricTitle}>Передачи</div>
                  <div className={classes.metricValue}>{totals.assists}</div>
                </div>
                <div className={classes.metric}>
                  <div className={classes.metricTitle}>ЖК</div>
                  <div className={classes.metricValue}>{totals.yellow}</div>
                </div>
                <div className={classes.metric}>
                  <div className={classes.metricTitle}>КК</div>
                  <div className={classes.metricValue}>{totals.red}</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ====== СТАТИСТИКА / ФИЛЬТРЫ ====== */}
        <div className={classes.statsHeader}>
          <div className={classes.statsTitle}>СТАТИСТИКА</div>
          <div className={classes.filters}>
            <div className={classes.selectWrap}>
              <label>СЕЗОН</label>
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
              >
                {seasonsList.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className={classes.selectWrap}>
              <label>ГОД</label>
              <select value={year} onChange={(e) => setYear(e.target.value)}>
                {yearsList.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ====== ТАБЛИЦА ПО МАТЧАМ ====== */}
        <div className={classes.table}>
          <div className={`${classes.tr} ${classes.trHead}`}>
            <div className={`${classes.td} ${classes.league}`}></div>
            <div className={`${classes.td} ${classes.match}`}></div>
            <div className={`${classes.td} ${classes.goals}`}>Г(ПН)</div>
            <div className={`${classes.td} ${classes.assists}`}>ПАС</div>
            <div className={`${classes.td} ${classes.yc}`}>ЖК</div>
            <div className={`${classes.td} ${classes.rc}`}>КК</div>
          </div>

          {/* строка итогов */}
          <div className={`${classes.tr} ${classes.trHead1}`}>
            <div className={`${classes.td} ${classes.league}`}>
              <b>{team?.title || '—'}</b>
            </div>
            <div className={`${classes.td} ${classes.match}`}>
              <b></b>
            </div>
            <div className={`${classes.td} ${classes.goals}`}>
              <b>
                {totals.goals}
                {totals.pens ? `(${totals.pens})` : ''}
              </b>
            </div>
            <div className={`${classes.td} ${classes.assists}`}>
              <b>{totals.assists}</b>
            </div>
            <div className={`${classes.td} ${classes.yc}`}>
              <b>{totals.yellow}</b>
            </div>
            <div className={`${classes.td} ${classes.rc}`}>
              <b>{totals.red}</b>
            </div>
          </div>

          {filteredRows.map((r) => {
            const { date, time } = fmtDate(r.date);
            const matchTitle = buildMatchTitle(r);

            return (
              <div
                className={classes.tr}
                key={`${r.matchId || r.date}-${r.opponent}`}
              >
                <div className={`${classes.td} ${classes.league}`}>
                  {r.league}
                </div>
                <div className={`${classes.td} ${classes.match}`}>
                  <div className={classes.matchTitle}>{matchTitle}</div>
                  <div className={classes.matchSub}>
                    {date} / {time}
                  </div>
                </div>
                <div className={`${classes.td} ${classes.goals}`}>
                  {r.goals || 0}
                  {r.pens ? `(${r.pens})` : ''}
                </div>
                <div className={`${classes.td} ${classes.assists}`}>
                  {r.assists || 0}
                </div>
                <div className={`${classes.td} ${classes.yc}`}>
                  {r.yellow || 0}
                </div>
                <div className={`${classes.td} ${classes.rc}`}>
                  {r.red || 0}
                </div>
              </div>
            );
          })}

          {!filteredRows.length && (
            <div className={classes.empty}>
              Нет матчей по выбранным фильтрам
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
