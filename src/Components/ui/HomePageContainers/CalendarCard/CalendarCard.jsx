import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

import classes from './CalendarCard.module.css';
import serverConfig from '../../../../serverConfig';

export default function CalendarCard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const navigate = useNavigate();

  const [matches, setMatches] = useState([]);
  const [selectedLeague, setSelectedLeague] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [leaguesRes, matchesRes] = await Promise.all([
          axios.get(`${serverConfig}/leagues`),
          axios.get(`${serverConfig}/leagueStandings`),
          axios.get(`${serverConfig}/matches`),
          axios.get(`${serverConfig}/playerStats`),
        ]);

        if (!alive) return;

        const leaguesData = Array.isArray(leaguesRes.data)
          ? leaguesRes.data
          : [];

        const m = Array.isArray(matchesRes.data) ? matchesRes.data : [];
        m.sort((a, b) => new Date(b.date) - new Date(a.date));
        setMatches(m);

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

  // последние завершённые матчи выбранной лиги
  const finishedAll = useMemo(
    () =>
      matches
        .filter(
          (m) =>
            m.status === 'SHEDULED' &&
            (!selectedLeague || m.league?.id === selectedLeague) &&
            m.homeTeam &&
            m.guestTeam &&
            m.date
        )
        .sort((a, b) => new Date(b.date) - new Date(a.date)),
    [matches, selectedLeague]
  );

  const DAYS_TO_SHOW = 4; // покажем последние 3 дня; можно увеличить
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
          day: 'numeric',
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

  // формат даты/времени/дня недели

  if (loading) return <div className={classes.container}>Загрузка…</div>;
  if (err) return <div className={classes.container}>{err}</div>;

  return (
    <div className={classes.containerBlockRes}>
      <span className={classes.title}>РЕЗУЛЬТАТЫ</span>

      <div className={classes.containerBlockResTable}>
        {finishedByDay.length === 0 && <div>Нет завершённых матчей</div>}

        {finishedByDay.map((day) => (
          <div key={day.key} className={classes.dayBlock}>
            <div className={classes.dayTitle}>
              <span> {day.title}</span>
              <span className={classes.dayWeek}>{day.weekday}</span>
            </div>

            <div className={classes.dayMatches}>
              {day.items.map((m) => (
                <div
                  key={m.id}
                  className={classes.resultRow}
                  onClick={() => navigate(`/match/${m.id}`)}
                >
                  <span className={classes.resTime}>{fmtTime(m.date)}</span>
                  <span className={classes.resTeam}>{m?.homeTeam?.title}</span>
                  <span className={classes.resScore}>
                    {m.homeScore} : {m.guestScore}
                  </span>
                  <span className={classes.resTeam}>{m?.guestTeam?.title}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        <span className={classes.bottom}>
          <button onClick={() => navigate('/calendar')}>ВСЕ РЕЗУЛЬТАТЫ</button>
        </span>
      </div>
    </div>
  );
}
