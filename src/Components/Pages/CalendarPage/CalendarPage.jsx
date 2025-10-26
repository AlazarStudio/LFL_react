import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import serverConfig from '../../../serverConfig';
import uploadsConfig from '../../../uploadsConfig';
import classes from './CalendarPage.module.css';
import { useNavigate } from 'react-router-dom';

const PER_PAGE = 12; // сколько матчей показывать на странице

/* ---------- утилиты (поддержка разных схем) ---------- */
const getT1 = (m) => m.team1 ?? m.homeTeam ?? m.team1TT?.team ?? null;
const getT2 = (m) => m.team2 ?? m.guestTeam ?? m.team2TT?.team ?? null;
const getT1Id = (m) =>
  m.team1Id ?? m.homeTeamId ?? m.team1TT?.teamId ?? getT1(m)?.id ?? null;
const getT2Id = (m) =>
  m.team2Id ?? m.guestTeamId ?? m.team2TT?.teamId ?? getT2(m)?.id ?? null;
const getScore1 = (m) => m.team1Score ?? m.homeScore ?? 0;
const getScore2 = (m) => m.team2Score ?? m.guestScore ?? 0;

/* турнир */
const getTournament = (m) => m.tournament ?? null;
const getTournamentTitle = (m) => getTournament(m)?.title ?? '';
const getSeason = (m) =>
  getTournament(m)?.season
    ? String(getTournament(m).season)
    : m?.date
    ? String(new Date(m.date).getFullYear())
    : '';

/* раунд (для турниров бывают stage/name/number) */
const stageLabel = (st) => {
  if (!st) return '';
  const map = {
    ROUND_OF_32: '1/16',
    ROUND_OF_16: '1/8',
    QUARTERFINAL: '1/4',
    SEMIFINAL: '1/2',
    FINAL: 'ФИНАЛ',
    THIRD_PLACE: 'МАТЧ ЗА 3-е',
  };
  return map[st] ?? String(st).replaceAll('_', ' ');
};
const getRoundTitle = (m) => {
  const r = m?.round;
  if (!r) return '';
  if (r.name) return r.name;
  if (r.number != null) return `${r.number}`;
  if (r.stage) return stageLabel(r.stage);
  return '';
};

const getStadiumName = (m) =>
  m?.stadium?.name ??
  m?.stadiumRel?.name ??
  (typeof m.stadium === 'string' ? m.stadium : '') ??
  '';

const teamLogoUrl = (team) =>
  team?.logo?.[0] ? `${uploadsConfig}${team.logo[0]}` : null;

/* форматтер ячейки даты */
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

export default function CalendarPage() {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  /* -------- справочники -------- */
  const [tournaments, setTournaments] = useState([]);
  const [tournamentId, setTournamentId] = useState(null); // выбранный турнир
  const [tournamentTeams, setTournamentTeams] = useState([]); // /tournaments/:id/teams

  /* -------- данные -------- */
  const [matches, setMatches] = useState([]);

  /* -------- фильтры -------- */
  const [teamId, setTeamId] = useState('ALL');
  const [season, setSeason] = useState('ALL');

  /* -------- пагинация -------- */
  const [page, setPage] = useState(1);

  /* ================= первичная загрузка: турниры ================= */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr('');
        const tRes = await axios.get(`${serverConfig}/tournaments`, {
          params: {
            sort: JSON.stringify(['startDate', 'DESC']),
            range: JSON.stringify([0, 999]),
          },
        });
        if (!alive) return;
        const tData = Array.isArray(tRes.data) ? tRes.data : [];
        setTournaments(tData);
        if (
          tData.length &&
          (tournamentId == null || !tData.find((t) => t.id === tournamentId))
        ) {
          setTournamentId(tData[0].id);
        }
      } catch (e) {
        console.error(e);
        if (alive) setErr('Не удалось загрузить список турниров');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ============== при смене турнира тянем его матчи + команды ============== */
  useEffect(() => {
    if (!tournamentId) return;
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr('');

        const [teamsRes, matchesRes] = await Promise.all([
          axios.get(`${serverConfig}/tournaments/${tournamentId}/teams`),
          axios.get(`${serverConfig}/tournaments/${tournamentId}/matches`, {
            params: {
              include: 'tournament,team1,team2,stadium,round',
              sort: JSON.stringify(['date', 'DESC']),
              range: JSON.stringify([0, 999]),
            },
          }),
        ]);

        if (!alive) return;

        const teamsData = Array.isArray(teamsRes.data) ? teamsRes.data : [];
        setTournamentTeams(teamsData);

        const matchesData = Array.isArray(matchesRes.data)
          ? matchesRes.data
          : [];
        // на всякий — сортировка по дате (новые сверху)
        matchesData.sort((a, b) => new Date(b.date) - new Date(a.date));
        setMatches(matchesData);

        // сбросим фильтры команды/сезона на ALL при переключении турнира
        setTeamId('ALL');
        setSeason('ALL');
        setPage(1);
      } catch (e) {
        console.error(e);
        if (alive) setErr('Не удалось загрузить данные турнира');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tournamentId]);

  /* ================= селекты ================= */
  const teamOptions = useMemo(() => {
    // строим из участников текущего турнира
    const opts = tournamentTeams
      .map((tt) => tt.team)
      .filter(Boolean)
      .map((t) => ({ value: String(t.id), label: t.title }));
    // удалим дубли (на всякий)
    const seen = new Set();
    const uniq = opts.filter((o) => !seen.has(o.value) && seen.add(o.value));
    return [{ value: 'ALL', label: 'Все команды' }, ...uniq];
  }, [tournamentTeams]);

  const seasonOptions = useMemo(() => {
    const set = new Set();
    matches.forEach((m) => set.add(getSeason(m)));
    set.delete('');
    const arr = Array.from(set).sort((a, b) => (a < b ? 1 : -1));
    return ['ALL', ...arr];
  }, [matches]);

  const tournamentOptions = useMemo(() => {
    return tournaments
      .map((t) => [String(t.id), t.title])
      .sort((a, b) => a[1].localeCompare(b[1], 'ru'));
  }, [tournaments]);

  /* ================= применение фильтров ================= */
  const filtered = useMemo(() => {
    let list = matches.slice();

    if (teamId !== 'ALL') {
      const tid = Number(teamId);
      list = list.filter((m) => getT1Id(m) === tid || getT2Id(m) === tid);
    }

    if (season !== 'ALL') {
      list = list.filter((m) => getSeason(m) === String(season));
    }

    return list;
  }, [matches, teamId, season]);

  // сброс страницы при смене фильтров
  useEffect(() => {
    setPage(1);
  }, [teamId, season]);

  // расчёт страниц/срез
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

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

  const Pagination = () => {
    if (totalPages <= 1) return null;
    const go = (p) => {
      setPage(p);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    return (
      <div
        className={classes.pagination}
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          marginTop: 16,
        }}
      >
        <button onClick={() => go(Math.max(1, page - 1))} disabled={page === 1}>
          ‹ Пред
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
          <button key={p} onClick={() => go(p)}>
            {p}
          </button>
        ))}
        <button
          onClick={() => go(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          След ›
        </button>
      </div>
    );
  };

  if (loading) return <div className={classes.pageWrap}>Загрузка…</div>;
  if (err) return <div className={classes.pageWrap}>{err}</div>;
  if (!tournaments.length)
    return <div className={classes.pageWrap}>Турниры не найдены</div>;

  return (
    <div className={classes.container}>
      <div className={classes.pageWrap}>
        <div className={classes.header}>
          <h1>КАЛЕНДАРЬ МАТЧЕЙ</h1>

          <div className={classes.filters}>
            {/* Турнир */}
            {tournamentOptions.length > 0 && (
              <label className={classes.filter}>
                <span>Турнир</span>
                <select
                  value={tournamentId ?? ''}
                  onChange={(e) => setTournamentId(Number(e.target.value))}
                >
                  {tournamentOptions.map(([id, title]) => (
                    <option key={id} value={id}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {/* Команда (из участников турнира) */}
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

            {/* Сезон (из матчей выбранного турнира) */}
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
          </div>
        </div>

        <div className={classes.body}>
          {/* ЛЕВАЯ — матчи */}
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
                    const t1 = getT1(m);
                    const t2 = getT2(m);
                    const homeLogo = teamLogoUrl(t1);
                    const guestLogo = teamLogoUrl(t2);
                    const tournamentTitle = getTournamentTitle(m);

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
                            <span className={classes.weekday}> {weekday}</span>
                          </div>
                          <div className={classes.place}>
                            <img src="../images/nartLocation.svg" alt="" />
                            <span>{getStadiumName(m) || '—'}</span>
                          </div>
                        </div>

                        {/* центр — эмблемы и счёт */}
                        <div className={classes.colScore}>
                          <div className={classes.team}>
                            {homeLogo ? (
                              <img
                                src={homeLogo}
                                alt={t1?.title}
                                className={classes.logo}
                              />
                            ) : (
                              <div className={classes.logoStub}>H</div>
                            )}
                            <span className={classes.teamName1}>
                              {t1?.title || `#${getT1Id(m)}`}
                            </span>
                          </div>

                          <div className={classes.score}>
                            {getScore1(m)} : {getScore2(m)}
                          </div>

                          <div className={classes.team}>
                            {guestLogo ? (
                              <img
                                src={guestLogo}
                                alt={t2?.title}
                                className={classes.logo}
                              />
                            ) : (
                              <div className={classes.logoStub}>G</div>
                            )}
                            <span className={classes.teamName1}>
                              {t2?.title || `#${getT2Id(m)}`}
                            </span>
                          </div>
                        </div>

                        {/* справа — турнир и раунд */}
                        <div className={classes.colMeta}>
                          <div className={classes.league /* оставил класс */}>
                            {tournamentTitle}
                          </div>
                          <div className={classes.round}>
                            {getRoundTitle(m)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <Pagination />
          </div>

          {/* ПРАВАЯ — участники турнира */}
          <div className={classes.standings}>
            <div className={classes.standingsHeader}>
              <span className={classes.containerBlockRightTopTitle}>
                УЧАСТНИКИ ТУРНИРА
              </span>
            </div>

            <div className={classes.standingsTable}>
              <div className={classes.headerRow}>
                <span>№</span>
                <span>Команда</span>
                <span>Посев</span>
                <span></span>
              </div>

              {tournamentTeams
                .slice()
                .sort(
                  (a, b) =>
                    (a.seed ?? 1e9) - (b.seed ?? 1e9) ||
                    (a.team?.title || '').localeCompare(b.team?.title || '')
                )
                .map((row, idx) => (
                  <div key={row.id} className={classes.standingRow}>
                    <span>{idx + 1}</span>
                    <span className={classes.teamName}>
                      {row.team?.logo?.[0] ? (
                        <img
                          src={`${uploadsConfig}${row.team.logo[0]}`}
                          alt={row.team?.title || 'logo'}
                        />
                      ) : (
                        <span className={classes.stLogoStub} />
                      )}
                      {row.team?.title || '—'}
                    </span>
                    <span>{row.seed ?? '—'}</span>
                    <span></span>
                  </div>
                ))}

              {/* если нужна ссылка на страницу турнира — раскомментируй/подправь роут */}
              {/* <button onClick={() => navigate(`/tournament/${tournamentId}`)}>
                О ТУРНИРЕ
              </button> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
