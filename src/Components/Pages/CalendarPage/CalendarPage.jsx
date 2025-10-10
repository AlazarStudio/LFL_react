import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import serverConfig from '../../../serverConfig';
import uploadsConfig from '../../../uploadsConfig';
import classes from './CalendarPage.module.css';
import { useNavigate } from 'react-router-dom';

const PER_PAGE = 12; // сколько матчей показывать на странице

export default function CalendarPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const [teams, setTeams] = useState([]);
  const [matches, setMatches] = useState([]);

  // фильтры
  const [teamId, setTeamId] = useState('ALL');
  const [season, setSeason] = useState('ALL');
  const [leagueId, setLeagueId] = useState('ALL');

  const [news, setNews] = useState([]);
  const [standings, setStandings] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(null);

  // пагинация
  const [page, setPage] = useState(1);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [newsRes, standingsRes, leaguesRes, matchesRes] =
          await Promise.all([
            axios.get(`${serverConfig}/news`),
            axios.get(`${serverConfig}/leagueStandings`),
            axios.get(`${serverConfig}/leagues`),
            axios.get(`${serverConfig}/matches`),
          ]);

        const sortedNews = [...newsRes.data].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );

        setNews(sortedNews.slice(0, 6));
        setStandings(standingsRes.data);
        setLeagues(leaguesRes.data);
        setMatches(matchesRes.data);
        if (leaguesRes.data.length > 0) {
          setSelectedLeague(leaguesRes.data[0].id);
        }
      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
      }
    };

    fetchData();
  }, []);

  const finishedMatches = matches
    .filter(
      (m) =>
        m.status === 'FINISHED' &&
        m.league?.id === selectedLeague &&
        m.homeTeam &&
        m.guestTeam
    )
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const filteredStandings = standings
    .filter((row) => !selectedLeague || row.league_id === selectedLeague)
    .sort((a, b) => b.points - a.points || b.goals_for - a.goals_for);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);

        // 1) все команды
        const tRes = await axios.get(`${serverConfig}/teams`);
        if (alive) setTeams(Array.isArray(tRes.data) ? tRes.data : []);

        // 2) все матчи
        const mRes = await axios.get(`${serverConfig}/matches`);
        const list = Array.isArray(mRes.data) ? mRes.data : [];

        // сортируем по дате (сначала свежие)
        list.sort((a, b) => new Date(b.date) - new Date(a.date));
        if (alive) setMatches(list);
      } catch (e) {
        if (alive) setErr('Не удалось загрузить календарь матчей');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // списки значений для селектов
  const teamOptions = useMemo(() => {
    const opts = teams.map((t) => ({ value: String(t.id), label: t.title }));
    return [{ value: 'ALL', label: 'Все команды' }, ...opts];
  }, [teams]);

  const seasonOptions = useMemo(() => {
    const set = new Set();
    matches.forEach((m) => {
      if (m?.league?.season) set.add(m.league.season);
      else if (m?.date) set.add(new Date(m.date).getFullYear().toString());
    });
    const arr = Array.from(set).sort((a, b) => (a < b ? 1 : -1));
    return ['ALL', ...arr];
  }, [matches]);

  const leagueOptions = useMemo(() => {
    const map = new Map();
    matches.forEach((m) => {
      if (m?.league) map.set(String(m.league.id), m.league.title);
    });
    const arr = Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], 'ru')
    );
    return [['ALL', 'Все турниры'], ...arr];
  }, [matches]);

  // применение фильтров
  const filtered = useMemo(() => {
    let list = matches;

    if (teamId !== 'ALL') {
      const tid = Number(teamId);
      list = list.filter((m) => m.homeTeamId === tid || m.guestTeamId === tid);
    }

    if (season !== 'ALL') {
      list = list.filter((m) => {
        const s = m?.league?.season
          ? String(m.league.season)
          : m?.date
          ? String(new Date(m.date).getFullYear())
          : '';
        return s === String(season);
      });
    }

    if (leagueId !== 'ALL') {
      list = list.filter((m) => String(m?.league?.id) === String(leagueId));
    }

    return list;
  }, [matches, teamId, season, leagueId]);

  // сбрасываем страницу при смене фильтров
  useEffect(() => {
    setPage(1);
  }, [teamId, season, leagueId]);

  // расчёт страниц
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  // текущий срез карточек
  const paged = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, page]);

  // группировка по месяцам — на основе текущей страницы
  const groups = useMemo(() => {
    const byKey = new Map(); // 'YYYY-MM' -> []
    paged.forEach((m) => {
      const d = new Date(m.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        '0'
      )}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(m);
    });

    // в массив, новые месяцы сверху
    return Array.from(byKey.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, items]) => {
        const [y, mm] = key.split('-').map(Number);
        const title = new Intl.DateTimeFormat('ru-RU', { month: 'long' })
          .format(new Date(y, mm - 1, 1))
          .toUpperCase();
        return { key, title: `${title} ${y}`, items };
      });
  }, [paged]);

  // форматтеры
  const fmtCellDate = (iso) => {
    const d = new Date(iso);
    const date = new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit',
      month: '2-digit',
    })
      .format(d)
      .replace(' г.', '');
    const time = d.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
      .format(d)
      .replace('.', '')
      .toUpperCase();
    return { date, time, weekday };
  };

  const teamLogo = (team) =>
    team?.logo?.[0] ? `${uploadsConfig}${team.logo[0]}` : null;

  const Pagination = () => {
    if (totalPages <= 1) return null;
    const go = (p) => {
      setPage(p);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    return (
      <div className={classes.pagination} style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
        <button
          onClick={() => go(Math.max(1, page - 1))}
          disabled={page === 1}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #e62d3c',
            background: page === 1 ? '#f5f5f5' : '#fff',
            cursor: page === 1 ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          ‹ Пред
        </button>

        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => go(p)}
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

        <button
          onClick={() => go(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #e62d3c',
            background: page === totalPages ? '#f5f5f5' : '#fff',
            cursor: page === totalPages ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          След ›
        </button>
      </div>
    );
  };

  if (loading) return <div className={classes.pageWrap}>Загрузка…</div>;
  if (err) return <div className={classes.pageWrap}>{err}</div>;

  return (
    <>
      <div className={classes.container}>
        <div className={classes.pageWrap}>
          <div className={classes.header}>
            <h1>КАЛЕНДАРЬ МАТЧЕЙ</h1>

            <div className={classes.filters}>
              <label className={classes.filter}>
                <span>Команда</span>
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                >
                  {teamOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={classes.filter}>
                <span>Сезон</span>
                <select
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                >
                  {seasonOptions.map((s) => (
                    <option key={s} value={s}>
                      {s === 'ALL' ? 'Все сезоны' : s}
                    </option>
                  ))}
                </select>
              </label>

              <label className={classes.filter}>
                <span>Турнир</span>
                <select
                  value={leagueId}
                  onChange={(e) => setLeagueId(e.target.value)}
                >
                  {leagueOptions.map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className={classes.body}>
            <div className={classes.games}>
              {groups.length === 0 && (
                <div className={classes.empty}>
                  Матчи по выбранным фильтрам не найдены
                </div>
              )}

              {groups.map((g) => (
                <div key={g.key} className={classes.monthBlock}>
                  <div className={classes.monthTitle}>{g.title}</div>

                  <div className={classes.list}>
                    {g.items.map((m) => {
                      const { date, time, weekday } = fmtCellDate(m.date);
                      const homeLogo = teamLogo(m.homeTeam);
                      const guestLogo = teamLogo(m.guestTeam);

                      return (
                        <div
                          key={m.id}
                          className={classes.card}
                          onClick={() => navigate(`/match/${m.id}`)}
                        >
                          {/* слева — дата & стадион */}
                          <div className={classes.colDate}>
                            <div className={classes.dateRow}>
                              <span className={classes.date}>{date} </span>
                              <span className={classes.time}>{time} </span>
                              <span className={classes.weekday}>
                                {' '}
                                {weekday}
                              </span>
                            </div>
                            <div className={classes.place}>
                              <img src="../images/nartLocation.svg" alt="" />
                              <span>{m.stadium}</span>
                            </div>
                          </div>

                          {/* центр — эмблемы и счёт */}
                          <div className={classes.colScore}>
                            <div className={classes.team}>
                              {homeLogo ? (
                                <img
                                  src={homeLogo}
                                  alt={m?.homeTeam?.title}
                                  className={classes.logo}
                                />
                              ) : (
                                <div className={classes.logoStub}>H</div>
                              )}
                              <span className={classes.teamName1}>
                                {m?.homeTeam?.title}
                              </span>
                            </div>

                            <div className={classes.score}>
                              {m.homeScore} : {m.guestScore}
                            </div>

                            <div className={classes.team}>
                              {guestLogo ? (
                                <img
                                  src={guestLogo}
                                  alt={m?.guestTeam?.title}
                                  className={classes.logo}
                                />
                              ) : (
                                <div className={classes.logoStub}>G</div>
                              )}
                              <span className={classes.teamName1}>
                                {m?.guestTeam?.title}
                              </span>
                            </div>
                          </div>

                          {/* справа — турнир и тур */}
                          <div className={classes.colMeta}>
                            <div className={classes.league}>
                              {m?.league?.title}
                            </div>
                            <div className={classes.round}>{m.round} тур</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              <Pagination />
            </div>

            <div className={classes.standings}>
              <div className={classes.standingsHeader}>
                <span className={classes.containerBlockRightTopTitle}>
                  ТУРНИРНАЯ ТАБЛИЦА
                </span>
              </div>
              {leagues.length > 0 && (
                <select
                  value={selectedLeague || ''}
                  onChange={(e) => setSelectedLeague(Number(e.target.value))}
                  className={classes.leagueSelect}
                >
                  {leagues.map((league) => (
                    <option key={league.id} value={league.id}>
                      {league.title}
                    </option>
                  ))}
                </select>
              )}
              <div className={classes.standingsTable}>
                <div className={classes.headerRow}>
                  <span>№</span>
                  <span>Команда</span>
                  <span>И</span>
                  <span>О</span>
                </div>

                {filteredStandings.map((row, idx) => (
                  <div key={row.id} className={classes.standingRow}>
                    <span>{idx + 1}</span>
                    <span className={classes.teamName}>
                      <img
                        src={`${uploadsConfig}${row.team.logo[0]}`}
                        alt="guest"
                      />
                      {row.team.title}
                    </span>
                    <span>{row.played}</span>
                    <span className={classes.points}>{row.points}</span>
                  </div>
                ))}
                <button onClick={() => navigate('/tournamentTable')}>
                  ПОСМОТРЕТЬ ВСЮ ТАБЛИЦУ
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
