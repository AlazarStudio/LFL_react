import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

import classes from './Container2.module.css';
import serverConfig from '../../../../serverConfig';
import uploadsConfig from '../../../../uploadsConfig';

export default function Container2() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [statTab, setStatTab] = useState('sc');

  const navigate = useNavigate();

  const [matches, setMatches] = useState([]);
  const [standings, setStandings] = useState([]);
  const [leagues, setLeagues] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(null);
  const [playerStats, setPlayerStats] = useState([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [leaguesRes, standingsRes, matchesRes, playerStatsRes] =
          await Promise.all([
            axios.get(`${serverConfig}/leagues`),
            axios.get(`${serverConfig}/leagueStandings`),
            axios.get(`${serverConfig}/matches`),
            axios.get(`${serverConfig}/playerStats`),
          ]);

        if (!alive) return;

        const leaguesData = Array.isArray(leaguesRes.data)
          ? leaguesRes.data
          : [];
        setLeagues(leaguesData);
        setStandings(Array.isArray(standingsRes.data) ? standingsRes.data : []);

        const m = Array.isArray(matchesRes.data) ? matchesRes.data : [];
        m.sort((a, b) => new Date(b.date) - new Date(a.date));
        setMatches(m);

        setPlayerStats(
          Array.isArray(playerStatsRes.data) ? playerStatsRes.data : []
        );

        if (leaguesData.length) setSelectedLeague(leaguesData[0].id); // первая лига по умолчанию
      } catch {
        if (alive) setErr('Не удалось загрузить данные');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // утилиты
  const teamLogo = (team) =>
    team?.logo?.[0] ? `${uploadsConfig}${team.logo[0]}` : null;
  const playerAvatar = (p) =>
    p?.images?.[0] ? `${uploadsConfig}${p.images[0]}` : null;
  const playerName = (row) =>
    row?.player?.name || row?.player_name || 'Без имени';
  const playerTeam = (row) =>
    row?.player?.team?.title || row?.team?.title || row?.team_name || '';

  const getLeagueIdFromStat = (row) =>
    row?.league_id ??
    row?.leagueId ??
    row?.league?.id ??
    row?.player?.team?.league?.id ??
    row?.team?.league?.id ??
    null;

  // последние завершённые матчи выбранной лиги
  const finishedAll = useMemo(
    () =>
      matches
        .filter(
          (m) => m.status === 'FINISHED' && m.homeTeam && m.guestTeam && m.date
        )
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [matches]
  );

  const DAYS_TO_SHOW = 10; // покажем последние 3 дня; можно увеличить
  const finishedByDay = useMemo(() => {
    const byKey = new Map(); // 'YYYY-MM-DD' -> []
    for (const m of finishedAll) {
      const d = new Date(m.date);
      const key =
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0');
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(m);
    }

    const arr = Array.from(byKey.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, items]) => {
        // сортируем матчи внутри дня по времени
        items.sort((a, b) => new Date(a.date) - new Date(b.date));

        const [y, mm, dd] = key.split('-').map(Number);
        const d = new Date(y, mm - 1, dd);

        const dateTitle = new Intl.DateTimeFormat('ru-RU', {
          day: '2-digit',
          month: '2-digit',
        }).format(d); // "4 октября"

        const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
          .format(d) // "пт."
          .replace('.', '') // "пт"
          .toUpperCase(); // "ПТ"

        return { key, title: dateTitle, weekday, items };
      });

    return arr.slice(0, DAYS_TO_SHOW);
  }, [finishedAll]);

  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });

  // таблица выбранной лиги
  const filteredStandings = useMemo(
    () =>
      standings
        .slice() // чтобы не мутировать исходный массив
        .sort((a, b) => b.points - a.points || b.goals_for - a.goals_for),
    [standings]
  );

  // —— СТАТИСТИКА ИГРОКОВ (фильтр по лиге -> топы) ——

  const finishedSummary = useMemo(() => {
    const played = finishedAll.length;
    const goals = finishedAll.reduce(
      (sum, m) =>
        sum + (Number(m.homeScore) || 0) + (Number(m.guestScore) || 0),
      0
    );
    return { played, goals };
  }, [finishedAll]);

  const filteredPlayerStats = useMemo(() => playerStats, [playerStats]);

  // без лимита
  const topBy = (key, secondary = 'matchesPlayed') => {
    const copy = [...filteredPlayerStats];
    copy.sort((a, b) => {
      const d = (Number(b[key]) || 0) - (Number(a[key]) || 0);
      if (d !== 0) return d;
      return (Number(a[secondary]) || 0) - (Number(b[secondary]) || 0);
    });
    return copy; // НЕ режем
  };

  const topScorers = useMemo(() => topBy('goals'), [filteredPlayerStats]);
  const topAssists = useMemo(() => topBy('assists'), [filteredPlayerStats]);
  const topCards = useMemo(() => {
    const copy = [...filteredPlayerStats];
    copy.sort((a, b) => {
      const rk = (Number(b.red_cards) || 0) - (Number(a.red_cards) || 0);
      if (rk !== 0) return rk;
      const yk = (Number(b.yellow_cards) || 0) - (Number(a.yellow_cards) || 0);
      if (yk !== 0) return yk;
      return (Number(a.matchesPlayed) || 0) - (Number(b.matchesPlayed) || 0);
    });
    return copy; // тоже без обрезки
  }, [filteredPlayerStats]);

  // формат даты/времени/дня недели

  if (loading) return <div className={classes.container}>Загрузка…</div>;
  if (err) return <div className={classes.container}>{err}</div>;

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        {/* ——— РЕЗУЛЬТАТЫ ——— */}
        <div className={classes.containerRes}>
          <div className={classes.cardTitle}>РЕЗУЛЬТАТЫ</div>
          <div className={classes.card}>
            <div className={classes.resultsList}>
              {finishedByDay.length === 0 && (
                <div className={classes.empty}>Нет завершённых матчей</div>
              )}

              {finishedByDay.map((day) => (
                <div key={day.key} className={classes.resultsDay}>
                  <div className={classes.dayPill}>
                    <span>{day.title}</span>
                    <span className={classes.dayPillWeek}>{day.weekday}</span>
                  </div>

                  {day.items.map((m) => (
                    <div
                      key={m.id}
                      className={classes.resultRow}
                      onClick={() => navigate(`/match/${m.id}`)}
                    >
                      <span className={classes.resTime}>{fmtTime(m.date)}</span>
                      <span className={classes.resTeam}>
                        {m?.homeTeam?.title}
                      </span>
                      <span className={classes.resScore}>
                        {m.homeScore} : {m.guestScore}
                      </span>
                      <span className={classes.resTeam}>
                        {m?.guestTeam?.title}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <span className={classes.null}> </span>
            <div className={classes.cardFooter}>
              <button
                className={classes.ghostBtn}
                onClick={() => navigate('/calendar')}
              >
                ВСЕ РЕЗУЛЬТАТЫ
              </button>
            </div>
          </div>
        </div>

        {/* ——— СТАТИСТИКА ——— */}
        <div className={classes.containerRes}>
          <div className={classes.cardTitle}>СТАТИСТИКА</div>
          <div className={classes.card}>
            <div className={classes.cardTitleRow}>
              <div
                className={classes.segments}
                role="tablist"
                aria-label="Статистика"
              >
                <button
                  className={`${classes.segBtn} ${
                    statTab === 'sc' ? classes.segActive : ''
                  }`}
                  onClick={() => setStatTab('sc')}
                  role="tab"
                >
                  Бомбардиры
                </button>
                <button
                  className={`${classes.segBtn} ${
                    statTab === 'as' ? classes.segActive : ''
                  }`}
                  onClick={() => setStatTab('as')}
                  role="tab"
                >
                  Ассистенты
                </button>
                <button
                  className={`${classes.segBtn} ${
                    statTab === 'cards' ? classes.segActive : ''
                  }`}
                  onClick={() => setStatTab('cards')}
                  role="tab"
                >
                  ЖК/КК
                </button>
              </div>
            </div>

            {/* шапка таблицы */}
            <div className={classes.psHead}>
              <span className={classes.psHeadPlayer}>ИГРОК</span>
              {statTab !== 'cards' ? (
                <>
                  <span className={classes.psHeadStat}>
                    {statTab === 'sc' ? 'Г' : 'П'}
                  </span>
                  <span className={classes.psHeadStat}>И</span>
                </>
              ) : (
                <>
                  <span className={classes.psHeadStat}>ЖК</span>
                  <span className={classes.psHeadStat}>КК</span>
                </>
              )}
            </div>

            {/* строки */}
            <div className={classes.psTable}>
              {(statTab === 'sc'
                ? topScorers
                : statTab === 'as'
                ? topAssists
                : topCards
              ).map((row, i) => (
                <div
                  key={row.id ?? `${playerName(row)}-${i}`}
                  className={`${classes.psRow} ${
                    i === 0 ? classes.psRowTop : ''
                  }`}
                >
                  <div className={classes.psPlayerCell}>
                    {playerAvatar(row.player) ? (
                      <img
                        src={playerAvatar(row.player)}
                        alt={playerName(row)}
                      />
                    ) : (
                      <span className={classes.psAvatarStub}>
                        {playerName(row).slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className={classes.psNameWrap}>
                      <div className={classes.psName}>{playerName(row)}</div>
                      {playerTeam(row) && (
                        <div className={classes.psTeam}>{playerTeam(row)}</div>
                      )}
                    </div>
                  </div>

                  {statTab !== 'cards' ? (
                    <>
                      <div className={classes.psNum}>
                        {statTab === 'sc' ? row.goals ?? 0 : row.assists ?? 0}
                      </div>
                      <div className={classes.psNum}>
                        {row.matchesPlayed ?? 0}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={classes.psNum}>
                        {row.yellow_cards ?? 0}
                      </div>
                      <div className={classes.psNum}>{row.red_cards ?? 0}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <span className={classes.null}> </span>
            <div className={classes.cardFooter}>
              <button
                className={classes.ghostBtn}
                onClick={() => navigate('/playerStats')}
              >
                ВСЯ СТАТИСТИКА
              </button>
            </div>
          </div>
        </div>

        {/* ——— ТУРНИРНАЯ ТАБЛИЦА ——— */}
        <div className={classes.containerRes}>
          <div className={classes.cardTitle}>ТУРНИРНАЯ ТАБЛИЦА</div>
          <div className={classes.card}>
            <div className={classes.cardTitleRow}></div>

            <div className={classes.stTable}>
              <div className={classes.stHead}>
                <span>№</span>
                <span className={classes.stHeadTeam}>КОМАНДА</span>
                <span>И</span>
                <span>О</span>
              </div>

              {filteredStandings.map((row, idx) => (
                <div key={row.id} className={classes.stRow}>
                  <span className={classes.stPos}>
                    <span
                      className={`${classes.stBadge} ${
                        idx === 0 ? classes.stBadgeLeader : ''
                      }`}
                    >
                      {idx + 1}
                    </span>
                  </span>

                  <span className={classes.stTeam}>
                    {row.team?.logo?.[0] ? (
                      <img
                        className={classes.stLogo}
                        src={`${uploadsConfig}${row.team.logo[0]}`}
                        alt={row.team?.title}
                      />
                    ) : (
                      <span className={classes.stLogoStub} />
                    )}
                    <span className={classes.stTeamName}>
                      {row.team?.title}
                    </span>
                  </span>

                  <span className={classes.stNum}>{row.played}</span>
                  <span className={`${classes.stNum} ${classes.stPts}`}>
                    {row.points}
                  </span>
                </div>
              ))}
            </div>
            <span className={classes.null}> </span>
            <div className={classes.cardFooter}>
              <button
                className={classes.ghostBtn}
                onClick={() => navigate('/tournamentTable')}
              >
                ПОСМОТРЕТЬ ВСЮ ТАБЛИЦУ
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
