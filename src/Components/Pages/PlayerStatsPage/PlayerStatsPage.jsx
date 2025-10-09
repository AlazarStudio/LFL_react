import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import serverConfig from '../../../serverConfig';
import uploadsConfig from '../../../uploadsConfig';
import classes from './PlayerStatsPage.module.css';

// ---- утилиты
const fmtDate = (d) => {
  try {
    const dt = new Date(d);
    const dd = dt.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'long',
    });
    const hh = dt.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return { date: dd.toUpperCase(), time: hh };
  } catch {
    return { date: '', time: '' };
  }
};
const notEmpty = (v) => v !== null && v !== undefined && v !== '';

// типы событий по твоей схеме
const GOAL_TYPES = new Set(['GOAL', 'PENALTY_SCORED']); // пенальти-забитые идут в голы
const ASSIST_TYPES = new Set(['ASSIST']);
const YC_TYPES = new Set(['YELLOW_CARD']);
const RC_TYPES = new Set(['RED_CARD']);

// название матча «Хозяева 2:1 Гости»
const buildMatchTitle = (row) => {
  const homeName = row.homeTeamName || '';
  const awayName = row.awayTeamName || '';
  const score = row.score ? ` ${row.score} ` : ' ';
  return `${homeName}${score}${awayName}`.trim();
};

export default function PlayerStatsPage() {
  const { id } = useParams(); // /playerStats/:id
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [player, setPlayer] = useState(null);
  const [team, setTeam] = useState(null);

  // источники
  const [rawStats, setRawStats] = useState([]); // /playerStats (агрегат на игрока — используем опционально)
  const [matches, setMatches] = useState([]); // матчи команды (с include)
  const [events, setEvents] = useState([]); // события игрока (может не понадобиться, если возьмём из matches)

  // фильтры
  const [season, setSeason] = useState('ALL');
  const [year, setYear] = useState('ALL');

  // ===== ЗАГРУЗКА ОСНОВЫ =====
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

        // команда
        if (pData?.teamId) {
          try {
            const t = await axios.get(`${serverConfig}/teams/${pData.teamId}`);
            if (alive) setTeam(t?.data || null);
          } catch {}
        }

        // агрегат игрока (может пригодиться)
        try {
          const s = await axios.get(`${serverConfig}/playerStats`, {
            params: { filter: JSON.stringify({ playerId: pData?.id }) },
          });
          if (alive) setRawStats(Array.isArray(s.data) ? s.data : []);
        } catch {}

        // матчи команды (контроллер уже include-ит команды/лигу/события/и т.п.)
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
        if (alive) setMatches(Array.isArray(m.data) ? m.data : []);

        // события этого игрока (опционально; если не вернётся — возьмём из matches)
        try {
          const ev = await axios.get(`${serverConfig}/matchEvents`, {
            params: { filter: JSON.stringify({ playerId: pData?.id }) },
          });
          if (alive) setEvents(Array.isArray(ev.data) ? ev.data : []);
        } catch {}
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

  // ===== Справочники =====
  const yearsList = useMemo(() => {
    const setYears = new Set();
    (matches || []).forEach((m) => {
      if (m?.date) setYears.add(new Date(m.date).getFullYear());
    });
    const arr = Array.from(setYears).sort((a, b) => b - a);
    return ['ALL', ...arr];
  }, [matches]);

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

  // ===== Список событий игрока: из /matchEvents или из include matches.events =====
  const playerEvents = useMemo(() => {
    if (Array.isArray(events) && events.length) return events;
    const out = [];
    (matches || []).forEach((m) => {
      (m?.events || []).forEach((ev) => {
        if (ev?.playerId === player?.id) {
          // убедимся, что есть matchId
          out.push({ ...ev, matchId: ev.matchId || m.id });
        }
      });
    });
    return out;
  }, [events, matches, player?.id]);

  // ===== Нормализация строк по матчам из matches + playerEvents =====
  const computedStatsRows = useMemo(() => {
    // сгруппируем события игрока по матчу
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
      if (!evs.length) return; // игрок не отметился событием — можно скрыть строку, как и раньше

      const date = m.date || null;
      const league = m.league?.title || '—';

      const homeTeamName = m.homeTeam?.title || '';
      const awayTeamName = m.guestTeam?.title || '';
      const isHome = m.homeTeamId === team?.id;

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
        // PENALTY_MISSED / SUBSTITUTION здесь не считаем
      });

      const score = [m.homeScore, m.guestScore].every(
        (v) => v !== null && v !== undefined
      )
        ? `${m.homeScore}:${m.guestScore}`
        : '';

      // сезон
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
  }, [matches, playerEvents, team?.id, team?.title]);

  // ===== Фильтры =====
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

  // ===== Итоги (по отфильтрованным матчам) =====
  const totals = useMemo(() => {
    const games = filteredRows.length; // «игры» как число строк (есть события игрока)
    const goals = filteredRows.reduce((s, r) => s + (r.goals || 0), 0);
    const pens = filteredRows.reduce((s, r) => s + (r.pens || 0), 0);
    const assists = filteredRows.reduce((s, r) => s + (r.assists || 0), 0);
    const yellow = filteredRows.reduce((s, r) => s + (r.yellow || 0), 0);
    const red = filteredRows.reduce((s, r) => s + (r.red || 0), 0);
    return { games, goals, pens, assists, yellow, red };
  }, [filteredRows]);

  // ===== Рендер =====
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
              <div className={classes.photoStub}>{player.name?.[0] || '?'}</div>
            )}
          </div>
          <div className={classes.heroRight}>
            <img src="../images/Group 201.png" className={classes.red} />
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

          {/* строка итогов под шапкой */}
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
