import React, { useEffect, useState, useMemo, useRef } from 'react';
import classes from './Container1.module.css';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import serverConfig from '../../../../serverConfig';
import uploadsConfig from '../../../../uploadsConfig';

export default function Container1() {
  const navigate = useNavigate();

  const [matchesRaw, setMatchesRaw] = useState([]);
  const [type, setType] = useState('SCHEDULED'); // будущие по умолчанию
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [perPage, setPerPage] = useState(window.innerWidth <= 768 ? 1 : 3);
  const [paused, setPaused] = useState(false);

  const sliderRef = useRef(null);
  const animRef = useRef(false);
  useEffect(() => {
    animRef.current = isAnimating;
  }, [isAnimating]);

  /* =============== helpers =============== */
  const ensureLeadingSlash = (p) => {
    const s = String(p || '').trim();
    if (!s) return '';
    return s.startsWith('/') ? s : '/' + s;
  };

  const pickLogo = (team) => {
    if (!team) return '';
    const l = team.logo;
    if (Array.isArray(l)) return l[0] || '';
    if (typeof l === 'string') return l;
    // иногда прилетает team.logoPath или team.badge
    return team.logoPath || team.badge || '';
  };

  // Приводим ответ сервера к единому формату,
  // чтобы дальше компонент работал с homeTeam/guestTeam/homeScore/guestScore/league/stadium
  const normalizeMatch = (m) => {
    const team1 = m.team1 || m.homeTeam || m.team1Obj || null;
    const team2 = m.team2 || m.guestTeam || m.team2Obj || null;
    const league = m.league || m.leagueObj || null;
    const stadiumObj = m.stadium || m.stadiumObj || null;

    const homeScore = Number.isFinite(Number(m.homeScore))
      ? Number(m.homeScore)
      : Number.isFinite(Number(m.team1Score))
      ? Number(m.team1Score)
      : 0;

    const guestScore = Number.isFinite(Number(m.guestScore))
      ? Number(m.guestScore)
      : Number.isFinite(Number(m.team2Score))
      ? Number(m.team2Score)
      : 0;

    const norm = {
      id: m.id,
      date: m.date,
      status: m.status || 'SCHEDULED',
      round: m.round ?? m.roundNumber ?? m.matchday ?? '',
      homeScore,
      guestScore,
      homeTeam: team1
        ? {
            id: team1.id ?? m.team1Id,
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
            id: team2.id ?? m.team2Id,
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
        '',
    };
    return norm;
  };

  /* =============== resize =============== */
  useEffect(() => {
    const handleResize = () => setPerPage(window.innerWidth <= 768 ? 1 : 3);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /* =============== load =============== */
  useEffect(() => {
    // Пытаемся запросить связи, если бэкенд поддерживает ?include=
    const url = `${serverConfig}/matches?include=team1,team2,league,stadium`;
    axios
      .get(url)
      .then((res) => setMatchesRaw(Array.isArray(res.data) ? res.data : []))
      .catch(() => {
        // фолбэк — без include
        axios
          .get(`${serverConfig}/matches`)
          .then((res2) =>
            setMatchesRaw(Array.isArray(res2.data) ? res2.data : [])
          )
          .catch((err) => {
            console.error('Ошибка загрузки матчей:', err);
            setMatchesRaw([]);
          });
      });
  }, []);

  // нормализованный список
  const matches = useMemo(() => matchesRaw.map(normalizeMatch), [matchesRaw]);

  /* =============== фильтрация =============== */
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

  /* =============== кольцевой слайс =============== */
  const circularSlice = (arr, start, count) => {
    if (arr.length === 0) return [];
    return Array.from(
      { length: count },
      (_, i) => arr[(start + i) % arr.length]
    );
  };

  /* =============== слайды (с клонами) =============== */
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

  /* =============== сброс позиции при изменениях =============== */
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

  /* =============== навигация =============== */
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

  /* =============== touch/hover autoplay =============== */
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

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        <div className={classes.containerBlockTop}>
          <img
            src="../images/LFLlogoBig.svg"
            className={classes.containerBlockTopLogo}
            alt="logo"
          />
          <img
            src="../images/Любительская футбольная лига.svg"
            className={classes.containerBlockTopTitle}
            alt="title"
          />
          <span className={classes.containerBlockTopResp}>
            Карачаево-Черкесской Республики
          </span>
          <div className={classes.containerBlockTopLink}>
            <Link to={''}>
              <img src="../images/nartBlackTg.svg" alt="tg" />
            </Link>
            <Link to={''}>
              <img src="../images/nartBlackVk.svg" alt="vk" />
            </Link>
            <Link to={''}>
              <img src="../images/nartBlackWa.svg" alt="wa" />
            </Link>
          </div>
        </div>

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

                    const homeLogo = match.homeTeam.logo[0]
                      ? `${uploadsConfig}${ensureLeadingSlash(
                          match.homeTeam.logo[0]
                        )}`
                      : '../images/team-placeholder.svg';
                    const guestLogo = match.guestTeam.logo[0]
                      ? `${uploadsConfig}${ensureLeadingSlash(
                          match.guestTeam.logo[0]
                        )}`
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
                          {match.league.title}
                        </div>
                        {match.round && (
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
      </div>
    </div>
  );
}
