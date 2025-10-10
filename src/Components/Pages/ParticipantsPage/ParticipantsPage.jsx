import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import classes from './ParticipantsPage.module.css';
import serverConfig from '../../../serverConfig';
import uploadsConfig from '../../../uploadsConfig';

const PER_PAGE = 15;

// типы событий — для совместимости с расчётом по /matchEvents
const GOAL_TYPES = new Set(['GOAL', 'PENALTY_SCORED']);
const ASSIST_TYPES = new Set(['ASSIST']);
const YC_TYPES = new Set(['YELLOW_CARD']);
const RC_TYPES = new Set(['RED_CARD']);

export default function ParticipantsPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const pathname = location.pathname.toLowerCase();

  // определяем текущий раздел по url
  const type = useMemo(() => {
    if (pathname.startsWith('/participants/players')) return 'players';
    if (pathname.startsWith('/participants/referees')) return 'referees';
    return 'teams';
  }, [pathname]);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- поиск с задержкой ---
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 500);
    return () => clearTimeout(t);
  }, [q]);

  const [year, setYear] = useState('ALL');

  // пагинация
  const [page, setPage] = useState(1);

  // агрегаты статистики по текущей странице игроков: { [playerId]: { games, goals, pens, assists, yc, rc, avg } }
  const [statsMap, setStatsMap] = useState({});

  // количество матчей для судей текущей страницы: { [refereeId]: number }
  const [refCounts, setRefCounts] = useState({});

  // загрузка данных в зависимости от раздела
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        let url = `${serverConfig}/teams`;
        if (type === 'players') url = `${serverConfig}/players`;
        if (type === 'referees') url = `${serverConfig}/referees`;
        const res = await axios.get(url);
        const data = Array.isArray(res.data) ? res.data : [];
        if (alive) {
          setItems(data);
          // при смене раздела сбрасываем поиск/год/страницу/агрегаты
          setQ('');
          setDebouncedQ('');
          setYear('ALL');
          setPage(1);
          setStatsMap({});
          setRefCounts({});
        }
      } catch (e) {
        if (alive) {
          setItems([]);
          setStatsMap({});
          setRefCounts({});
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [type]);

  // при смене фильтров — на первую страницу
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, year]);

  // плейсхолдер поиска
  const placeholder = useMemo(() => {
    if (type === 'players' || type === 'referees') return 'Поиск по ФИО';
    return 'Поиск по команде';
  }, [type]);

  // --- убрать тренерский штаб из списка игроков ---
  const isRealPlayer = (it) => {
    if (typeof it.isPlayer === 'boolean') return it.isPlayer;

    const boolFlags = [it.isCoach, it.coach, it.staff, it.is_staff];
    if (
      boolFlags.some((v) => v === true || v === 1 || v === '1' || v === 'true')
    )
      return false;

    const roleStr = [
      it.role,
      it.position,
      it.titleRole,
      it.staffRole,
      it.category,
      it.type,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const staffWords = [
      'тренер',
      'главный тренер',
      'ассистент',
      'врач',
      'массажист',
      'администратор',
      'тренерский штаб',
      'менеджер',
      'coach',
      'assistant',
      'staff',
      'physio',
      'goalkeeping coach',
      'doctor',
    ];
    if (roleStr && staffWords.some((k) => roleStr.includes(k))) return false;

    return true;
  };

  // геттер локальной статистики игрока — фолбэк
  const getLocalStats = (p) => {
    const s = p.stats || p.statistics || {};
    const games = Number(s.games ?? p.games ?? 0);
    const goals = Number(s.goals ?? p.goals ?? 0);
    const pens = Number(s.penalties ?? s.penaltyGoals ?? p.penalties ?? 0);
    const avg = Number(s.rating ?? p.rating ?? 0); // "СР"
    const assists = Number(s.assists ?? p.assists ?? 0);
    const yc = Number(s.yellow ?? s.yellowCards ?? p.yellow ?? 0);
    const rc = Number(s.red ?? s.redCards ?? p.red ?? 0);
    return { games, goals, pens, avg, assists, yc, rc };
  };

  // база для фильтрации (для players — только игроки)
  const baseItems = useMemo(() => {
    if (type !== 'players') return items;
    return items.filter(isRealPlayer);
  }, [items, type]);

  // сбор лет/сезонов — из «очищенного» массива
  const years = useMemo(() => {
    const set = new Set();
    baseItems.forEach((it) => {
      const y =
        it.season || it.year || it.league?.season || it.team?.league?.season;
      if (y) set.add(String(y));
    });
    const arr = Array.from(set).sort((a, b) => b.localeCompare(a));
    return arr.length
      ? ['ALL', ...arr]
      : ['ALL', String(new Date().getFullYear())];
  }, [baseItems]);

  // фильтрация по поиску и году
  const filtered = useMemo(() => {
    const query = debouncedQ.trim().toLowerCase();
    return baseItems.filter((it) => {
      const hay = (
        (it.title || it.name || '') +
        ' ' +
        (it.team?.title || it.team_name || '')
      ).toLowerCase();
      const okQ = query ? hay.includes(query) : true;

      const itYear = String(
        it.season ||
          it.year ||
          it.league?.season ||
          it.team?.league?.season ||
          ''
      );
      const okYear =
        year === 'ALL' ? true : itYear ? String(itYear) === String(year) : true;

      return okQ && okYear;
    });
  }, [baseItems, debouncedQ, year]);

  // гарантируем, что текущая страница не выйдет за пределы
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // текущий срез карточек/строк
  const paged = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, page]);

  // === Агрегаты для PLAYERS (по /playerStats + /matchEvents) ===
  useEffect(() => {
    if (type !== 'players') return;
    let alive = true;

    const ids = (paged || []).map((p) => p.id).filter(Boolean);
    if (!ids.length) {
      if (alive) setStatsMap({});
      return;
    }

    (async () => {
      try {
        // 1) /playerStats -> matchesPlayed, goals, assists, yellow_cards, red_cards
        let statRows = [];
        try {
          const r1 = await axios.get(`${serverConfig}/playerStats`, {
            params: { filter: JSON.stringify({ playerId: { in: ids } }) },
          });
          statRows = Array.isArray(r1.data) ? r1.data : [];
        } catch {
          try {
            const r2 = await axios.get(`${serverConfig}/playerStats`, {
              params: {
                filter: JSON.stringify({
                  OR: ids.map((id) => ({ playerId: id })),
                }),
              },
            });
            statRows = Array.isArray(r2.data) ? r2.data : [];
          } catch {
            statRows = [];
          }
        }

        const fromStats = {};
        statRows.forEach((r) => {
          const pid = r.playerId || r.player?.id;
          if (!pid) return;
          const prev = fromStats[pid] || {
            games: 0,
            goals: 0,
            assists: 0,
            yc: 0,
            rc: 0,
          };
          fromStats[pid] = {
            games: prev.games + Number(r.matchesPlayed ?? 0),
            goals: prev.goals + Number(r.goals ?? 0),
            assists: prev.assists + Number(r.assists ?? 0),
            yc: prev.yc + Number(r.yellow_cards ?? 0),
            rc: prev.rc + Number(r.red_cards ?? 0),
          };
        });

        // 2) /matchEvents -> считаем пенальти (и подстраховываем игры через уникальные матчи)
        let evs = [];
        try {
          const e1 = await axios.get(`${serverConfig}/matchEvents`, {
            params: { filter: JSON.stringify({ playerId: { in: ids } }) },
          });
          evs = Array.isArray(e1.data) ? e1.data : [];
        } catch {
          try {
            const e2 = await axios.get(`${serverConfig}/matchEvents`, {
              params: {
                filter: JSON.stringify({
                  OR: ids.map((id) => ({ playerId: id })),
                }),
              },
            });
            evs = Array.isArray(e2.data) ? e2.data : [];
          } catch {
            const packs = await Promise.allSettled(
              ids.map((id) =>
                axios.get(`${serverConfig}/matchEvents`, {
                  params: { filter: JSON.stringify({ playerId: id }) },
                })
              )
            );
            evs = packs.flatMap((p) =>
              p.status === 'fulfilled' && Array.isArray(p.value.data)
                ? p.value.data
                : []
            );
          }
        }

        const fromEvents = {};
        evs.forEach((ev) => {
          const pid = ev.playerId || ev.player?.id;
          if (!pid) return;
          const type = ev.type;
          const mid = ev.matchId;

          const cur = fromEvents[pid] || {
            matches: new Set(),
            pens: 0,
            assists: 0,
            yc: 0,
            rc: 0,
          };

          if (mid) cur.matches.add(mid);
          if (type === 'PENALTY_SCORED') cur.pens += 1;
          if (type === 'ASSIST') cur.assists += 1;
          if (type === 'YELLOW_CARD') cur.yc += 1;
          if (type === 'RED_CARD') cur.rc += 1;

          fromEvents[pid] = cur;
        });

        // 3) собрать итоговую карту
        const map = {};
        ids.forEach((id) => {
          const s = fromStats[id];
          const e = fromEvents[id];

          const gamesFromStats = s ? Number(s.games || 0) : 0;
          const gamesFromEvents = e ? e.matches.size : 0;

          map[id] = {
            games: gamesFromStats > 0 ? gamesFromStats : gamesFromEvents,
            goals: s ? Number(s.goals || 0) : 0,
            pens: e ? Number(e.pens || 0) : 0, // пенальти — только из событий
            assists: s
              ? Number(s.assists || 0)
              : e
              ? Number(e.assists || 0)
              : 0,
            yc: s ? Number(s.yc || 0) : e ? Number(e.yc || 0) : 0,
            rc: s ? Number(s.rc || 0) : e ? Number(e.rc || 0) : 0,
            avg: 0, // рейтинга в схеме нет
          };
        });

        if (alive) setStatsMap(map);
      } catch {
        if (alive) setStatsMap({});
      }
    })();

    return () => {
      alive = false;
    };
  }, [type, paged]);

  // === Количество матчей для REFEREES (по /matches.matchReferees, год учитываем) ===
  useEffect(() => {
    if (type !== 'referees') return;
    let alive = true;

    const ids = (paged || []).map((r) => r.id).filter(Boolean);
    if (!ids.length) {
      if (alive) setRefCounts({});
      return;
    }

    (async () => {
      try {
        const where = {
          matchReferees: { some: { refereeId: { in: ids } } },
        };

        if (year !== 'ALL') {
          const y = Number(year);
          const gte = new Date(y, 0, 1).toISOString();
          const lt = new Date(y + 1, 0, 1).toISOString();
          where.date = { gte, lt };
        }

        const res = await axios.get(`${serverConfig}/matches`, {
          params: { filter: JSON.stringify(where) },
        });

        const rows = Array.isArray(res.data) ? res.data : [];
        const map = {};
        for (const m of rows) {
          for (const mr of m.matchReferees || []) {
            const rid = mr.refereeId;
            if (ids.includes(rid)) {
              map[rid] = (map[rid] || 0) + 1;
            }
          }
        }

        if (alive) setRefCounts(map);
      } catch {
        if (alive) setRefCounts({});
      }
    })();

    return () => {
      alive = false;
    };
  }, [type, paged, year]);

  // утилиты изображений
  const teamCover = (t) =>
    t?.images?.[0]
      ? `${uploadsConfig}${t.images[0]}`
      : t?.cover?.[0]
      ? `${uploadsConfig}${t.cover[0]}`
      : '/images/placeholder-team.jpg';

  const teamLogo = (t) =>
    t?.logo?.[0] ? `${uploadsConfig}${t.logo[0]}` : null;

  const personPhoto = (p) =>
    p?.images?.[0]
      ? `${uploadsConfig}${p.images[0]}`
      : p?.photo?.[0]
      ? `${uploadsConfig}${p.photo[0]}`
      : '/images/placeholder-player.jpg';

  // карточка ТОЛЬКО для команд
  const renderCard = (it) => {
    return (
      <article
        key={it.id}
        className={classes.cardTeam}
        onClick={() => navigate(`/club/${it.id}`)}
      >
        <div className={classes.cardTeamImage}>
          <img src={teamCover(it)} alt={it.title} />
        </div>
        <div className={classes.infoBar}>
          {teamLogo(it) ? (
            <div className={classes.cardTeamLogo}>
              <img
                className={classes.logo}
                src={teamLogo(it)}
                alt={`${it.title} логотип`}
              />
            </div>
          ) : (
            <div className={classes.logoStub} />
          )}
          <div className={classes.infoText}>
            <div className={classes.titleMain}>{it.title}</div>
            {it.city && <div className={classes.subtle}>{it.city}</div>}
          </div>
        </div>
      </article>
    );
  };

  // простая постраничная навигация снизу
  const Pagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className={classes.pagination}>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => {
              setPage(p);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{
              minWidth: 36,
              height: 36,
              padding: '0 10px',
              borderRadius: 8,
              border: '1px solid #e62d3c',
              background: p === page ? '#e62d3c' : '#fff',
              color: p === page ? '#fff' : '#111827',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {p}
          </button>
        ))}
      </div>
    );
  };

  // чтобы при необходимости пробрасывать агрегаты наружу
  const formStats = statsMap;

  return (
    <div className={classes.container}>
      <div className={classes.block}>
        <div className={classes.headerRow}>
          <h1 className={classes.pageTitle}>УЧАСТНИКИ</h1>
          <div className={classes.right}>
            <div className={classes.tabs}>
              <NavLink
                to="/participants/teams"
                className={({ isActive }) =>
                  isActive ? `${classes.tab} ${classes.active}` : classes.tab
                }
              >
                КОМАНДЫ
              </NavLink>
              <NavLink
                to="/participants/players"
                className={({ isActive }) =>
                  isActive ? `${classes.tab} ${classes.active}` : classes.tab
                }
              >
                ИГРОКИ
              </NavLink>
              <NavLink
                to="/participants/referees"
                className={({ isActive }) =>
                  isActive ? `${classes.tab} ${classes.active}` : classes.tab
                }
              >
                СУДЬИ
              </NavLink>
              <select
                className={classes.yearSelect}
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y === 'ALL' ? 'Все годы' : y}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className={classes.loading}>Загрузка…</div>
        ) : (
          <div className={classes.grid}>
            <div className={classes.searchRow}>
              <input
                className={classes.searchInput}
                placeholder={placeholder}
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button
                className={classes.searchBtn}
                onClick={() => {
                  /* фильтрация уже реактивная через debouncedQ */
                }}
              >
                ПОИСК
              </button>
            </div>

            {paged.length === 0 ? (
              <div className={classes.loading} style={{ padding: 24 }}>
                Ничего не найдено
              </div>
            ) : type === 'players' ? (
              // ===== Таблица игроков с агрегированной статистикой =====
              <div className={classes.tableWrap}>
                <div className={`${classes.table} ${classes.playersTable}`}>
                  <div className={`${classes.tr} ${classes.thead}`}>
                    <div className={`${classes.td} ${classes.colNum}`}>№</div>
                    <div className={`${classes.td} ${classes.colPlayer}`}>
                      ИГРОК
                    </div>
                    <div className={`${classes.td} ${classes.colShort}`}>И</div>
                    <div className={`${classes.td} ${classes.colShort}`}>
                      Г(ПН.)
                    </div>
                    <div className={`${classes.td} ${classes.colShort}`}>
                      СР
                    </div>
                    <div className={`${classes.td} ${classes.colShort}`}>П</div>
                    <div className={`${classes.td} ${classes.colShort}`}>
                      ЖК
                    </div>
                    <div className={`${classes.td} ${classes.colShort}`}>
                      КК
                    </div>
                  </div>

                  {paged.map((it, idx) => {
                    const iGlobal = (page - 1) * PER_PAGE + idx + 1;

                    // Берём агрегаты из statsMap; если нет — локальный фолбэк
                    const agg = statsMap[it.id];
                    const { games, goals, pens, avg, assists, yc, rc } = agg
                      ? agg
                      : getLocalStats(it);

                    const photo = personPhoto(it);

                    return (
                      <div
                        key={it.id}
                        className={`${classes.tr} ${classes.clickable}`}
                        onClick={() => navigate(`/playerStats/${it.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) =>
                          e.key === 'Enter'
                            ? navigate(`/playerStats/${it.id}`)
                            : null
                        }
                      >
                        <div className={`${classes.td} ${classes.colNum}`}>
                          {iGlobal}
                        </div>
                        <div className={`${classes.td} ${classes.colPlayer}`}>
                          <img
                            className={classes.avatar}
                            src={photo}
                            alt={it.name || 'Игрок'}
                            onError={(e) =>
                              (e.currentTarget.src =
                                '/images/placeholder-player.jpg')
                            }
                          />
                          <div className={classes.playerMeta}>
                            <div className={classes.playerName}>{it.name}</div>
                            {it.team?.title && (
                              <div className={classes.playerTeam}>
                                {it.team.title}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={`${classes.td} ${classes.colShort}`}>
                          {games || 0}
                        </div>
                        <div className={`${classes.td} ${classes.colShort}`}>
                          {Number(goals || 0)}
                          {pens ? `(${Number(pens)})` : ''}
                        </div>
                        <div className={`${classes.td} ${classes.colShort}`}>
                          {Number(avg || 0)}
                        </div>
                        <div className={`${classes.td} ${classes.colShort}`}>
                          {Number(assists || 0)}
                        </div>
                        <div className={`${classes.td} ${classes.colShort}`}>
                          {Number(yc || 0)}
                        </div>
                        <div className={`${classes.td} ${classes.colShort}`}>
                          {Number(rc || 0)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Pagination />
              </div>
            ) : type === 'referees' ? (
              // ===== Таблица судей (как на скрине) =====
              <div className={classes.tableWrap}>
                <div className={`${classes.table} ${classes.playersTable}`}>
                  <div className={`${classes.tr} ${classes.thead}`}>
                    <div className={`${classes.td} ${classes.colNum}`}>№</div>
                    <div className={`${classes.td} ${classes.colPlayer}`}>
                      СУДЬЯ
                    </div>
                    <div className={`${classes.td} ${classes.colShort}`}>И</div>
                  </div>

                  {paged.map((it, idx) => {
                    const iGlobal = (page - 1) * PER_PAGE + idx + 1;
                    const photo = it?.images?.[0]
                      ? `${uploadsConfig}${it.images[0]}`
                      : '/images/placeholder-player.jpg';
                    const matches = refCounts[it.id] || 0;

                    return (
                      <div
                        key={it.id}
                        className={`${classes.tr} ${classes.clickable}`}
                        onClick={() => navigate(`/players/${it.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) =>
                          e.key === 'Enter'
                            ? navigate(`/players/${it.id}`)
                            : null
                        }
                      >
                        <div className={`${classes.td} ${classes.colNum}`}>
                          {iGlobal}
                        </div>
                        <div className={`${classes.td} ${classes.colPlayer}`}>
                          <img
                            className={classes.avatar}
                            src={photo}
                            alt={it.name || 'Судья'}
                            onError={(e) =>
                              (e.currentTarget.src =
                                '/images/placeholder-player.jpg')
                            }
                          />
                          <div className={classes.playerMeta}>
                            <div className={classes.playerName}>{it.name}</div>
                            {it.category && (
                              <div className={classes.playerTeam}>
                                {it.category}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className={`${classes.td} ${classes.colShort}`}>
                          {matches}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Pagination />
              </div>
            ) : (
              // ===== Карточки команд =====
              <>
                <div className={classes.gridCards}>{paged.map(renderCard)}</div>
                <Pagination />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
