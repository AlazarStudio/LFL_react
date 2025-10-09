import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import serverConfig from '../../../serverConfig';
import uploadsConfig from '../../../uploadsConfig';
import classes from './ClubPage.module.css';
import { useNavigate, useLocation, useParams } from 'react-router-dom';

export default function ClubPage() {
  const [team, setTeam] = useState(null);
  const [standings, setStandings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const navigate = useNavigate();
  const { hash, search } = useLocation();
  const { id: routeId } = useParams?.() || {}; // поддержка /club/:id, если роут настроен
  const teamBlockRef = useRef(null);

  // --- календарь ---
  const [matches, setMatches] = useState([]);
  const [type, setType] = useState('FINISHED'); // <-- ПРОШЕДШИЕ по умолчанию
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [perPage, setPerPage] = useState(window.innerWidth <= 768 ? 1 : 3);
  const sliderRef = useRef(null);
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);

  // --- состав ---
  const [players, setPlayers] = useState([]);
  const [tab, setTab] = useState('ALL'); // ALL | GOALKEEPER | DEFENDER | MIDFIELDER | FORWARD | STAFF

  const PLAYER_POS = ['GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD'];
  const STAFF_POS = [
    'HEAD_COACH',
    'ASSISTANT_COACH',
    'GOALKEEPER_COACH',
    'FITNESS_COACH',
    'ANALYST',
    'PHYSIOTHERAPIST',
    'DOCTOR',
    'TEAM_MANAGER',
    'MASSEUR',
    'KIT_MANAGER',
    'GENERAL_DIRECTOR',
    'SPORTS_DIRECTOR',
    'DEPUTY_GENERAL_DIRECTOR',
    'MEDIA_OFFICER',
    'SECURITY_OFFICER',
    'FAN_LIAISON',
  ];

  const posRu = {
    GOALKEEPER: 'ВРАТАРЬ',
    DEFENDER: 'ЗАЩИТНИК',
    MIDFIELDER: 'ПОЛУЗАЩИТНИК',
    FORWARD: 'НАПАДАЮЩИЙ',
    HEAD_COACH: 'ГЛАВНЫЙ ТРЕНЕР',
    ASSISTANT_COACH: 'ТРЕНЕР/АССИСТЕНТ',
    GOALKEEPER_COACH: 'ТРЕНЕР ВРАТАРЕЙ',
    FITNESS_COACH: 'ТРЕНЕР ПО ФИЗПОДГОТОВКЕ',
    ANALYST: 'АНАЛИТИК',
    PHYSIOTHERAPIST: 'ФИЗИОТЕРАПЕВТ',
    DOCTOR: 'ВРАЧ',
    TEAM_MANAGER: 'АДМИНИСТРАТОР',
    MASSEUR: 'МАССАЖИСТ',
    KIT_MANAGER: 'ЭКИПИРОВЩИК',
    GENERAL_DIRECTOR: 'ГЕНЕРАЛЬНЫЙ ДИРЕКТОР',
    SPORTS_DIRECTOR: 'СПОРТИВНЫЙ ДИРЕКТОР',
    DEPUTY_GENERAL_DIRECTOR: 'ЗАМ. ГЕН. ДИРЕКТОРА',
    MEDIA_OFFICER: 'СОТРУДНИК ПО РАБОТЕ СО СМИ',
    SECURITY_OFFICER: 'СОТРУДНИК ПО БЕЗОПАСНОСТИ',
    FAN_LIAISON: 'СОТРУДНИК ПО РАБОТЕ С БОЛЕЛЬЩИКАМИ',
  };

  const posToRu = (p) => posRu[p] || p || '—';
  const norm = (s) => (s ?? '').toString().trim().toLocaleLowerCase('ru-RU');
  const slugify = (title = '') =>
    norm(title)
      .replace(/[ё]/g, 'е')
      .replace(/[^a-z0-9\u0430-\u044f\s-]/gi, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');

  // обработка переходов #players / #staff
  useEffect(() => {
    const params = new URLSearchParams(search);
    const qtab = (params.get('tab') || '').toLowerCase();

    let target = null;
    if (hash === '#staff' || qtab === 'staff') target = 'STAFF';
    if (
      hash === '#players' ||
      qtab === 'players' ||
      qtab === 'all' ||
      qtab === 'sostav'
    )
      target = 'ALL';

    if (target) {
      setTab(target);
      requestAnimationFrame(() => {
        teamBlockRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  }, [hash, search]);

  // ===== ЗАГРУЗКА КОМАНДЫ ПО id/слагу из URL (если роут /club/:id). Если нет — прежняя логика «Нарт» =====
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr('');

        let found = null;

        if (routeId) {
          // 1) пробуем как числовой id
          const numericId = Number(routeId);
          const looksNumeric =
            Number.isFinite(numericId) && String(numericId) === String(routeId);
          if (looksNumeric) {
            try {
              const r = await axios.get(`${serverConfig}/teams/${numericId}`);
              if (r?.data?.id) found = r.data;
            } catch {}
          }
        }

        // 2) slug/название или fallback на «Нарт»
        if (!found) {
          const teamsRes = await axios.get(`${serverConfig}/teams`);
          const rows = Array.isArray(teamsRes.data) ? teamsRes.data : [];

          if (routeId) {
            const bySlug = rows.find(
              (t) => slugify(t.slug || t.title) === slugify(routeId)
            );
            if (bySlug) found = bySlug;
            else {
              const byIncludes = rows.find((t) =>
                norm(t.title).includes(norm(routeId))
              );
              if (byIncludes) found = byIncludes;
            }
          } else {
            // старое поведение (команда Нарт)
            const exact = rows.find((t) => norm(t.title) === 'нарт');
            found =
              exact || rows.find((t) => norm(t.title).includes('нарт')) || null;
            if (!found) setErr('Команда «Нарт» не найдена');
          }
        }

        if (alive) setTeam(found || null);

        const stRes = await axios.get(`${serverConfig}/leagueStandings`);
        if (alive) setStandings(Array.isArray(stRes.data) ? stRes.data : []);
      } catch {
        if (alive) setErr('Не удалось загрузить данные клуба');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [routeId]);

  // загрузка матчей (фильтруем по выбранной команде)
  useEffect(() => {
    if (!team?.id) {
      setMatches([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        // если бэкенд умеет фильтр — это лучший вариант:
        // const res = await axios.get(`${serverConfig}/matches`, {
        //   params: { filter: JSON.stringify({ OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] }) }
        // });

        const res = await axios.get(`${serverConfig}/matches`);
        const rows = Array.isArray(res.data) ? res.data : [];

        const onlyTeam = rows.filter((m) => {
          const hId =
            m.homeTeamId ?? m.home_team_id ?? m.homeTeam?.id ?? m.home_team?.id;
          const aId =
            m.awayTeamId ?? m.away_team_id ?? m.awayTeam?.id ?? m.away_team?.id;
          return (
            Number(hId) === Number(team.id) || Number(aId) === Number(team.id)
          );
        });

        if (alive) setMatches(onlyTeam);
      } catch (err) {
        console.error('Ошибка загрузки матчей:', err);
        if (alive) setMatches([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [team?.id]);

  // загрузка игроков
  useEffect(() => {
    if (!team?.id) return;
    let alive = true;
    (async () => {
      try {
        let res;
        try {
          res = await axios.get(`${serverConfig}/players`, {
            params: { filter: JSON.stringify({ teamId: team.id }) },
          });
          if (!Array.isArray(res.data)) throw new Error('fallback');
        } catch {
          res = await axios.get(`${serverConfig}/players`);
        }
        const rows = Array.isArray(res.data) ? res.data : [];
        const onlyTeam = rows.filter((p) => p.teamId === team.id);
        if (alive) setPlayers(onlyTeam);
      } catch (e) {
        console.error('Ошибка загрузки игроков:', e);
      }
    })();
    return () => {
      alive = false;
    };
  }, [team?.id]);

  // perPage по ширине
  useEffect(() => {
    const handleResize = () => setPerPage(window.innerWidth <= 768 ? 1 : 3);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const aggregated = useMemo(() => {
    if (!team)
      return { games: 0, wins: 0, goals: 0, tournaments: 0, source: 'none' };
    const byTeam = standings.filter((row) => row.team_id === team.id);
    if (byTeam.length > 0) {
      const games = byTeam.reduce((sum, r) => sum + (r.played ?? 0), 0);
      const wins = byTeam.reduce((sum, r) => sum + (r.wins ?? 0), 0);
      const goals = byTeam.reduce((sum, r) => sum + (r.goals_for ?? 0), 0);
      const tournaments = new Set(byTeam.map((r) => r.league_id)).size;
      return { games, wins, goals, tournaments, source: 'standings' };
    }
    return {
      games: Number.isFinite(team.games) ? team.games : 0,
      wins: Number.isFinite(team.wins) ? team.wins : 0,
      goals: Number.isFinite(team.goals) ? team.goals : 0,
      tournaments: Number.isFinite(team.tournaments) ? team.tournaments : 0,
      source: 'team',
    };
  }, [team, standings]);

  // ——— календари —
  const filtered = useMemo(() => {
    const now = new Date();
    const list = matches.filter((m) =>
      type === 'FINISHED' ? new Date(m.date) < now : new Date(m.date) >= now
    );
    return list.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [matches, type]);

  const slides = useMemo(() => {
    if (filtered.length === 0) return [];
    return [
      ...filtered.slice(-perPage),
      ...filtered,
      ...filtered.slice(0, perPage),
    ];
  }, [filtered, perPage]);

  const total = filtered.length;
  const startIndex = perPage;

  useEffect(() => {
    setIndex(startIndex);
  }, [filtered, type, perPage]);

  const handleNext = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setIndex((prev) => prev + 1);
  };
  const handlePrev = () => {
    if (isAnimating) return;
    setIsAnimating(true);
    setIndex((prev) => prev - 1);
  };

  const handleTransitionEnd = () => {
    setIsAnimating(false);
    if (!sliderRef.current) return;
    if (index >= total + perPage) {
      setIndex(startIndex);
      sliderRef.current.style.transition = 'none';
      requestAnimationFrame(() => {
        sliderRef.current.style.transform = `translateX(-${
          startIndex * (100 / perPage)
        }%)`;
      });
    }
    if (index <= 0) {
      setIndex(total);
      sliderRef.current.style.transition = 'none';
      requestAnimationFrame(() => {
        sliderRef.current.style.transform = `translateX(-${
          total * (100 / perPage)
        }%)`;
      });
    }
  };

  useEffect(() => {
    if (!sliderRef.current) return;
    sliderRef.current.style.transition = isAnimating
      ? 'transform 0.5s ease-in-out'
      : 'none';
    sliderRef.current.style.transform = `translateX(-${
      index * (100 / perPage)
    }%)`;
  }, [index, perPage, isAnimating]);

  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const onTouchEnd = () => {
    const delta = touchStartX.current - touchEndX.current;
    if (Math.abs(delta) > 50) delta > 0 ? handleNext() : handlePrev();
  };

  const activeIndex = total > 0 ? (index - perPage + total) % total : 0;

  // ——— состав —
  const filteredPlayers = useMemo(() => {
    const roster = players || [];
    const onlyPlayers = roster.filter((p) => PLAYER_POS.includes(p.position));
    const onlyStaff = roster.filter((p) => STAFF_POS.includes(p.position));

    switch (tab) {
      case 'GOALKEEPER':
      case 'DEFENDER':
      case 'MIDFIELDER':
      case 'FORWARD':
        return onlyPlayers.filter((p) => p.position === tab);
      case 'STAFF':
        return onlyStaff;
      case 'ALL':
      default:
        return onlyPlayers;
    }
  }, [players, tab]);

  if (loading) return <div style={{ padding: 16 }}>Загрузка…</div>;
  if ((err && !team) || !team)
    return <div style={{ padding: 16 }}>{err || 'Команда не найдена'}</div>;

  // вспомогатели для календаря
  const fmtDT = (d) => {
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

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        {/* верхний блок клуба */}
        <div className={classes.containerBlockTop}>
          <div className={classes.containerBlockTopLeft}>
            {Array.isArray(team.images) && team.images[0] && (
              <img
                src={`${uploadsConfig}${team.images[0]}`}
                alt={team.title}
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}
          </div>

          <div className={classes.containerBlockTopRight}>
            <div className={classes.containerBlockTopRightTopTitle}>
              {Array.isArray(team.logo) && team.logo[0] && (
                <img
                  src={`${uploadsConfig}${team.logo[0]}`}
                  alt={team.title}
                  onError={(e) => (e.currentTarget.style.display = 'none')}
                />
              )}

              <span>{team.title}</span>
            </div>

            <div className={classes.containerBlockTopRightBottom}>
              <div className={classes.containerBlockTopRightBottomEl}>
                <span>Игры</span>
                <span>{aggregated.games}</span>
              </div>
              <div className={classes.containerBlockTopRightBottomEl}>
                <span>Победы</span>
                <span>{aggregated.wins}</span>
              </div>
              <div className={classes.containerBlockTopRightBottomEl}>
                <span>Голы</span>
                <span>{aggregated.goals}</span>
              </div>
              <div className={classes.containerBlockTopRightBottomEl}>
                <span>Турниры</span>
                <span>{aggregated.tournaments}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ===== КАЛЕНДАРЬ ===== */}
        <div className={classes.containerBlockCalendar}>
          <div className={classes.containerBlockCalendarLeft}>
            <span>
              <img src="../images/LFLcal.svg" />
              КАЛЕНДАРЬ
            </span>
            <img src="../images/Line 2.svg" />
            <div className={classes.buttons}>
              <span
                onClick={() => setType('FINISHED')}
                className={type === 'FINISHED' ? classes.activeTab : ''}
              >
                ПРОШЕДШИЕ
              </span>
              <span
                onClick={() => setType('SCHEDULED')}
                className={type === 'SCHEDULED' ? classes.activeTab : ''}
              >
                БУДУЩИЕ
              </span>
            </div>
            <span className={classes.nav}>
              <img src="../images/LFLleft.svg" onClick={handlePrev} />
              <img src="../images/LFLright.svg" onClick={handleNext} />
            </span>
          </div>
          <div
            className={classes.containerBlockRight}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
          >
            {total === 0 ? (
              <div className={classes.empty}>
                Пока нет матчей в этой вкладке
              </div>
            ) : (
              <>
                <div
                  className={classes.slider}
                  ref={sliderRef}
                  onTransitionEnd={handleTransitionEnd}
                >
                  {slides.map((match, i) => {
                    const date = new Date(match.date);
                    const dayMonth = new Intl.DateTimeFormat('ru-RU', {
                      day: '2-digit',
                      month: 'long',
                    }).format(date);
                    const weekday = new Intl.DateTimeFormat('ru-RU', {
                      weekday: 'short',
                    })
                      .format(date)
                      .replace('.', '');
                    const hours = date.getHours().toString().padStart(2, '0');
                    const minutes = date
                      .getMinutes()
                      .toString()
                      .padStart(2, '0');
                    const formatted = `${dayMonth} ${hours}:${minutes} ${weekday}`;

                    return (
                      <div
                        key={`${match.id}-${i}`}
                        className={classes.matchCard}
                        onClick={() => navigate(`/match/${match.id}`)}
                      >
                        <div className={classes.matchDate}>{formatted}</div>
                        {match?.stadium && (
                          <div className={classes.matchStadium}>
                            <img src="../images/LFLloc.svg" alt="loc" />
                            {match.stadium}
                          </div>
                        )}

                        <div className={classes.matchScore}>
                          <img
                            src={`${uploadsConfig}${
                              match?.homeTeam?.logo?.[0] ?? ''
                            }`}
                            alt="home"
                          />
                          <span>
                            {match.homeScore} : {match.guestScore}
                          </span>
                          <img
                            src={`${uploadsConfig}${
                              match?.guestTeam?.logo?.[0] ?? ''
                            }`}
                            alt="guest"
                          />
                        </div>
                        <div className={classes.matchLeague}>
                          {match?.league?.title}
                        </div>
                        <div className={classes.matchRound}>
                          {match.round} ТУР
                        </div>
                      </div>
                    );
                  })}
                </div>

                {perPage === 1 && total > 1 && (
                  <div className={classes.dots}>
                    {filtered.map((_, i) => (
                      <span
                        key={i}
                        className={`${classes.dot} ${
                          i === activeIndex ? classes.activeDot : ''
                        }`}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        {/* ===== /КАЛЕНДАРЬ ===== */}

        {/* ===== СОСТАВ ===== */}
        <div className={classes.containerTeam} ref={teamBlockRef} id="players">
          <div className={classes.containerTeamTitle}>ОСНОВНОЙ СОСТАВ</div>

          <div className={classes.containerTeamFilter}>
            <button
              onClick={() => setTab('ALL')}
              className={`${classes.filterBtn} ${
                tab === 'ALL' ? classes.filterBtnActive : ''
              }`}
              aria-pressed={tab === 'ALL'}
            >
              ИГРОКИ
            </button>

            <button
              onClick={() => setTab('STAFF')}
              className={`${classes.filterBtn} ${
                tab === 'STAFF' ? classes.filterBtnActive : ''
              }`}
              aria-pressed={tab === 'STAFF'}
            >
              ТРЕНЕРСКИЙ ШТАБ
            </button>
          </div>

          <div className={classes.containerTeamComand}>
            {filteredPlayers.map((p) => {
              const img =
                Array.isArray(p.images) && p.images[0]
                  ? `${uploadsConfig}${p.images[0]}`
                  : null;
              return (
                <div
                  key={p.id}
                  className={classes.playerCard}
                  onClick={() => navigate(`/playerStats/${p.id}`)} // ведём на страницу статистики игрока
                >
                  <div className={classes.playerThumb}>
                    {img ? (
                      <img
                        src={img}
                        alt={p.name}
                        loading="lazy"
                        onError={(e) =>
                          (e.currentTarget.style.visibility = 'hidden')
                        }
                      />
                    ) : (
                      <div className={classes.noPhoto}>
                        {p.name?.[0] || '?'}
                      </div>
                    )}
                  </div>
                  <div className={classes.playerInfo}>
                    <img
                      src="../images/Group 202.svg"
                      className={classes.red}
                    />
                    <div className={classes.playerPos}>
                      <span>{posToRu(p.position)}</span>
                      {PLAYER_POS.includes(p.position) &&
                        p.number != null &&
                        p.number !== '' && <span> {p.number}</span>}
                    </div>
                    <span className={classes.playerName}>{p.name}</span>
                  </div>
                </div>
              );
            })}
            {filteredPlayers.length === 0 && (
              <div className={classes.emptyList}>
         
              </div>
            )}
          </div>
        </div>
        {/* ===== /СОСТАВ ===== */}
      </div>
    </div>
  );
}
