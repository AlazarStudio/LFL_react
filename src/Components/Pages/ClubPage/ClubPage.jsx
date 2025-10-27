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
  const { id: routeId } = useParams() || {};
  const teamBlockRef = useRef(null);

  // ====== assets helpers (фикс логотипов) ======
  const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');
  const buildSrc = (p) => {
    const s = String(p || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s; // уже абсолютный URL
    const needsSlash = s.startsWith('/') ? '' : '/';
    return `${ASSETS_BASE}${needsSlash}${s}`; // относительные -> к базе без /api
  };

  // --- календарь ---
  const [matches, setMatches] = useState([]);
  const [type, setType] = useState('SCHEDULED'); // как в Container1
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [perPage, setPerPage] = useState(window.innerWidth <= 768 ? 1 : 3);
  const [paused, setPaused] = useState(false);
  const sliderRef = useRef(null);
  const animRef = useRef(false);
  useEffect(() => {
    animRef.current = isAnimating;
  }, [isAnimating]);

  // ===== helpers для матчей =====
  const pickLogo = (team) => {
    if (!team) return '';
    const l = team.logo;
    if (Array.isArray(l)) return l[0] || '';
    if (typeof l === 'string') return l;
    return team.logoPath || team.badge || '';
  };

  const normalizeMatch = (m) => {
    const team1 = m.team1 || m.homeTeam || m.team1Obj || m.home_team || null;
    const team2 =
      m.team2 || m.guestTeam || m.team2Obj || m.awayTeam || m.away_team || null;
    const league = m.league || m.leagueObj || null;
    const stadiumObj = m.stadium || m.stadiumObj || null;

    const homeScore = Number.isFinite(Number(m.homeScore))
      ? Number(m.homeScore)
      : Number.isFinite(Number(m.team1Score))
      ? Number(m.team1Score)
      : Number.isFinite(Number(m.home_score))
      ? Number(m.home_score)
      : 0;

    const guestScore = Number.isFinite(Number(m.guestScore))
      ? Number(m.guestScore)
      : Number.isFinite(Number(m.team2Score))
      ? Number(m.team2Score)
      : Number.isFinite(Number(m.guest_score))
      ? Number(m.guest_score)
      : 0;

    return {
      id: m.id,
      date: m.date,
      status: m.status || 'SCHEDULED',
      round: m.round ?? m.roundNumber ?? m.matchday ?? m.round_number ?? '',
      homeScore,
      guestScore,
      homeTeam: team1
        ? {
            id: team1.id ?? m.team1Id ?? m.homeTeamId ?? m.home_team_id,
            title:
              team1.title || team1.name || `#${team1.id ?? m.team1Id ?? ''}`,
            logo: [pickLogo(team1)].filter(Boolean),
          }
        : {
            id: m.team1Id,
            title: m.team1Title || `#${m.team1Id ?? ''}`,
            logo: [],
          },
      guestTeam: team2
        ? {
            id: team2.id ?? m.team2Id ?? m.awayTeamId ?? m.away_team_id,
            title:
              team2.title || team2.name || `#${team2.id ?? m.team2Id ?? ''}`,
            logo: [pickLogo(team2)].filter(Boolean),
          }
        : {
            id: m.team2Id,
            title: m.team2Title || `#${m.team2Id ?? ''}`,
            logo: [],
          },
      league: {
        title:
          league?.title ||
          league?.name ||
          m.leagueTitle ||
          (typeof m.league === 'string' ? m.league : '') ||
          '',
      },
      stadium:
        (typeof stadiumObj === 'string'
          ? stadiumObj
          : stadiumObj?.name || stadiumObj?.title) ||
        m.stadiumName ||
        m.stadium ||
        '',
    };
  };

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

  const POS_TO_ROLE = {
    GK: 'GOALKEEPER',
    RB: 'DEFENDER',
    CB: 'DEFENDER',
    LB: 'DEFENDER',
    RWB: 'DEFENDER',
    LWB: 'DEFENDER',
    DM: 'MIDFIELDER',
    CM: 'MIDFIELDER',
    AM: 'MIDFIELDER',
    RW: 'MIDFIELDER',
    LW: 'MIDFIELDER',
    SS: 'FORWARD',
    ST: 'FORWARD',
  };
  const toRole = (code) => POS_TO_ROLE[code] || code;
  const posToRu = (p) => posRu[toRole(p)] || p || '—';

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

  // ===== загрузка команды
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        setErr('');

        let found = null;

        if (routeId) {
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

  // ===== загрузка матчей для выбранной команды
  useEffect(() => {
    if (!team?.id) {
      setMatches([]);
      return;
    }
    let alive = true;
    (async () => {
      try {
        let rows = [];
        // пытаемся получить матчи с вложенными командами (для логотипов)
        try {
          const resInc = await axios.get(`${serverConfig}/matches`, {
            params: { include: 'team1,team2,league,stadium' },
          });
          rows = Array.isArray(resInc.data) ? resInc.data : [];
        } catch {
          const res = await axios.get(`${serverConfig}/matches`);
          rows = Array.isArray(res.data) ? res.data : [];
        }

        const onlyTeam = rows.filter((m) => {
          const ids = [
            m.homeTeamId,
            m.home_team_id,
            m.homeTeam?.id,
            m.home_team?.id,
            m.hostTeamId,
            m.host_team_id,
            m.hostTeam?.id,
            m.host_team?.id,
            m.awayTeamId,
            m.away_team_id,
            m.awayTeam?.id,
            m.away_team?.id,
            m.guestTeamId,
            m.guest_team_id,
            m.guestTeam?.id,
            m.guest_team?.id,
            m.team1Id,
            m.team1?.id,
            m.team2Id,
            m.team2?.id,
          ]
            .filter((v) => v != null)
            .map(Number);
          return ids.some((id) => id === Number(team.id));
        });

        const normalized = onlyTeam.map(normalizeMatch);
        if (alive) setMatches(normalized);
      } catch (e) {
        console.error('Ошибка загрузки матчей:', e);
        if (alive) setMatches([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [team?.id]);

  // ===== загрузка игроков
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
        const onlyTeam = rows.filter(
          (p) => Number(p.teamId ?? p.team_id) === Number(team.id)
        );
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

  // ——— фильтрация и слайды (как в Container1) ———
  const filtered = useMemo(() => {
    const nowTs = Date.now();
    const isFinished = (m) => {
      if (m.status) return m.status === 'FINISHED';
      const hasScore =
        Number.isFinite(Number(m.homeScore)) &&
        Number.isFinite(Number(m.guestScore));
      if (hasScore) return true;
      const ts = Date.parse(m.date);
      return Number.isFinite(ts) && ts < nowTs;
    };
    const isScheduled = (m) => {
      if (m.status) return m.status !== 'FINISHED';
      const ts = Date.parse(m.date);
      return Number.isFinite(ts) && ts >= nowTs;
    };
    const list = matches.filter((m) =>
      type === 'FINISHED' ? isFinished(m) : isScheduled(m)
    );
    return list.sort((a, b) => {
      const ta = Date.parse(a.date) || 0;
      const tb = Date.parse(b.date) || 0;
      return type === 'FINISHED' ? tb - ta : ta - tb;
    });
  }, [matches, type]);

  const total = filtered.length;

  const circularSlice = (arr, start, count) => {
    if (arr.length === 0) return [];
    return Array.from(
      { length: count },
      (_, i) => arr[(start + i) % arr.length]
    );
  };

  const slides = useMemo(() => {
    if (total === 0) return [];
    const left = circularSlice(
      filtered,
      (total - (perPage % total)) % total,
      perPage
    );
    const right = circularSlice(filtered, 0, perPage);
    return [...left, ...filtered, ...right];
  }, [filtered, perPage, total]);

  const startIndex = useMemo(
    () => (total === 0 ? 0 : perPage),
    [perPage, total]
  );
  const maxRealIndex = useMemo(
    () => (total === 0 ? 0 : perPage + total - 1),
    [perPage, total]
  );

  // сброс позиции при изменениях
  useEffect(() => {
    setIndex(startIndex);
    if (sliderRef.current) {
      sliderRef.current.style.transition = 'none';
      sliderRef.current.style.transform = `translateX(-${
        startIndex * (100 / perPage)
      }%)`;
      requestAnimationFrame(() => {
        if (sliderRef.current) sliderRef.current.style.transition = '';
      });
    }
  }, [startIndex, perPage, total, type]);

  // навигация
  const handleNext = () => {
    if (total === 0 || isAnimating) return;
    setIsAnimating(true);
    setIndex((prev) => prev + 1);
  };
  const handlePrev = () => {
    if (total === 0 || isAnimating) return;
    setIsAnimating(true);
    setIndex((prev) => prev - 1);
  };

  const handleTransitionEnd = () => {
    setIsAnimating(false);
    if (total === 0) return;

    if (index > maxRealIndex) {
      const newIndex = index - total;
      setIndex(newIndex);
      if (sliderRef.current) {
        sliderRef.current.style.transition = 'none';
        sliderRef.current.style.transform = `translateX(-${
          newIndex * (100 / perPage)
        }%)`;
        requestAnimationFrame(() => {
          if (sliderRef.current) sliderRef.current.style.transition = '';
        });
      }
    } else if (index < perPage) {
      const newIndex = index + total;
      setIndex(newIndex);
      if (sliderRef.current) {
        sliderRef.current.style.transition = 'none';
        sliderRef.current.style.transform = `translateX(-${
          newIndex * (100 / perPage)
        }%)`;
        requestAnimationFrame(() => {
          if (sliderRef.current) sliderRef.current.style.transition = '';
        });
      }
    }
  };

  // обновляем transform/transition
  useEffect(() => {
    if (!sliderRef.current) return;
    const hasTransition =
      sliderRef.current.style.transition &&
      sliderRef.current.style.transition !== 'none';
    if (isAnimating && !hasTransition) {
      sliderRef.current.style.transition = 'transform 0.5s ease-in-out';
    }
    sliderRef.current.style.transform = `translateX(-${
      index * (100 / perPage)
    }%)`;
  }, [index, perPage, isAnimating]);

  // touch + autoplay с паузой
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const onTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    setPaused(true);
  };
  const onTouchMove = (e) => {
    touchEndX.current = e.touches[0].clientX;
  };
  const onTouchEnd = () => {
    const delta = touchStartX.current - touchEndX.current;
    if (Math.abs(delta) > 50) delta > 0 ? handleNext() : handlePrev();
    setPaused(false);
  };

  useEffect(() => {
    if (paused || total === 0) return;
    const id = setInterval(() => {
      if (!animRef.current) handleNext();
    }, 3000);
    return () => clearInterval(id);
  }, [paused, total, type]);

  const activeIndex =
    total > 0 ? (((index - perPage) % total) + total) % total : 0;

  // ——— состав ———
  const filteredPlayers = useMemo(() => {
    const roster = players || [];
    const onlyPlayers = roster.filter((p) =>
      PLAYER_POS.includes(toRole(p.position))
    );
    const onlyStaff = roster.filter((p) =>
      STAFF_POS.includes(toRole(p.position))
    );

    switch (tab) {
      case 'GOALKEEPER':
      case 'DEFENDER':
      case 'MIDFIELDER':
      case 'FORWARD':
        return onlyPlayers.filter((p) => toRole(p.position) === tab);
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

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        {/* верхний блок клуба */}
        <div className={classes.containerBlockTop}>
          <div className={classes.containerBlockTopLeft}>
            {Array.isArray(team.images) && team.images[0] && (
              <img
                src={buildSrc(team.images[0])}
                alt={team.title}
                onError={(e) => (e.currentTarget.style.display = 'none')}
              />
            )}
          </div>

          <div className={classes.containerBlockTopRight}>
            <div className={classes.containerBlockTopRightTopTitle}>
              {Array.isArray(team.logo) && team.logo[0] && (
                <img
                  src={buildSrc(team.logo[0])}
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
              <img src="../images/LFLcal.svg" alt="cal" />
              КАЛЕНДАРЬ
            </span>
            <img src="../images/Line 2.svg" alt="line" />
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
              <img
                src="../images/LFLleft.svg"
                onClick={handlePrev}
                alt="prev"
              />
              <img
                src="../images/LFLright.svg"
                onClick={handleNext}
                alt="next"
              />
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

                    const homeLogo = match.homeTeam?.logo?.[0]
                      ? buildSrc(match.homeTeam.logo[0])
                      : '../images/team-placeholder.svg';
                    const guestLogo = match.guestTeam?.logo?.[0]
                      ? buildSrc(match.guestTeam.logo[0])
                      : '../images/team-placeholder.svg';

                    return (
                      <div
                        key={`${match.id}-${i}`}
                        className={classes.matchCard}
                        onClick={() => navigate(`/match/${match.id}`)}
                      >
                        <div className={classes.matchDate}>{formatted}</div>

                        {match.stadium && (
                          <div className={classes.matchStadium}>
                            <img src="../images/LFLloc.svg" alt="loc" />
                            {match.stadium}
                          </div>
                        )}

                        <div className={classes.matchScore}>
                          <img src={homeLogo} alt="home" />
                          <span>
                            {match.homeScore} : {match.guestScore}
                          </span>
                          <img src={guestLogo} alt="guest" />
                        </div>

                        <div className={classes.matchLeague}>
                          {match.league?.title}
                        </div>
                        {!!match.round && (
                          <div className={classes.matchRound}>
                            {match.round} ТУР
                          </div>
                        )}
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
                  ? buildSrc(p.images[0])
                  : null;
              const isPlayerRole = PLAYER_POS.includes(toRole(p.position));
              return (
                <div
                  key={p.id}
                  className={classes.playerCard}
                  onClick={() => navigate(`/playerStats/${p.id}`)}
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
                      <img
                        src={'/images/bgPlCard.png'}
                        alt={p.name}
                        loading="lazy"
                        onError={(e) =>
                          (e.currentTarget.style.visibility = 'hidden')
                        }
                      />
                    )}
                  </div>
                  <div className={classes.playerInfo}>
                    <img
                      src="../images/Group 202.svg"
                      className={classes.red}
                      alt=""
                    />
                    <div className={classes.playerPos}>
                      <span>{posToRu(p.position)}</span>
                      {isPlayerRole && p.number != null && p.number !== '' && (
                        <span> {p.number}</span>
                      )}
                    </div>
                    <span className={classes.playerName}>{p.name}</span>
                  </div>
                </div>
              );
            })}
            {filteredPlayers.length === 0 && (
              <div className={classes.emptyList}></div>
            )}
          </div>
        </div>
        {/* ===== /СОСТАВ ===== */}
      </div>
    </div>
  );
}
