import React, { useEffect, useState, useMemo, useRef } from 'react';
import classes from './Container1.module.css';
import { Link } from 'react-router-dom';
import axios from 'axios';
import serverConfig from '../../../../serverConfig';
import uploadsConfig from '../../../../uploadsConfig';
import { useNavigate } from 'react-router-dom';

export default function Container1() {
  const navigate = useNavigate();

  const [matches, setMatches] = useState([]);
  const [type, setType] = useState('SCHEDULED'); // ✅ по умолчанию будущие
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [perPage, setPerPage] = useState(window.innerWidth <= 768 ? 1 : 3);
  const [paused, setPaused] = useState(false);

  const sliderRef = useRef(null);
  const animRef = useRef(false);
  useEffect(() => {
    animRef.current = isAnimating;
  }, [isAnimating]);

  // ---------- resize -> пересчёт perPage ----------
  useEffect(() => {
    const handleResize = () => setPerPage(window.innerWidth <= 768 ? 1 : 3);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ---------- загрузка ----------
  useEffect(() => {
    axios
      .get(`${serverConfig}/matches`)
      .then((res) => setMatches(res.data))
      .catch((err) => console.error('Ошибка загрузки матчей:', err));
  }, []);

  // ---------- фильтрация (надёжная) ----------
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

  // ---------- утилита кольцевого слайса ----------
  const circularSlice = (arr, start, count) => {
    if (arr.length === 0) return [];
    return Array.from(
      { length: count },
      (_, i) => arr[(start + i) % arr.length]
    );
  };

  // ---------- строим слайды: клоны слева и справа всегда есть (даже если 1 карточка) ----------
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

  // ---------- переход в старт при смене данных/вкладки/ширины ----------
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

  // ---------- кнопки ----------
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

  // ---------- завершение анимации и «телепорт» на оригинальные позиции ----------
  const handleTransitionEnd = () => {
    setIsAnimating(false);
    if (total === 0) return;

    if (index > maxRealIndex) {
      const newIndex = index - total; // пролистали вправо за реальные — отматываем на total назад
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
      const newIndex = index + total; // пролистали влево — вперёд на total
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

  // ---------- применение transform при каждом шаге ----------
  useEffect(() => {
    if (!sliderRef.current) return;
    // Если transition пустая строка — зададим дефолт анимацию
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

  // ---------- touch ----------
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

  // ---------- автопрокрутка (работает и при 1 карточке) ----------
  useEffect(() => {
    if (paused || total === 0) return;
    const id = setInterval(() => {
      if (!animRef.current) handleNext();
    }, 3000);
    return () => clearInterval(id);
  }, [paused, total, type]);

  // ---------- активная точка для мобилки ----------
  const activeIndex =
    total > 0 ? (((index - perPage) % total) + total) % total : 0;

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        <div className={classes.containerBlockTop}>
          <img
            src="../images/LFLlogoBig.svg"
            className={classes.containerBlockTopLogo}
          />
          <img
            src="../images/Любительская футбольная лига.svg"
            className={classes.containerBlockTopTitle}
          />
          <span className={classes.containerBlockTopResp}>
            Карачаево-Черкесской Республики
          </span>
          <div className={classes.containerBlockTopLink}>
            <Link to={''}>
              <img src="../images/nartBlackTg.svg" />
            </Link>
            <Link to={''}>
              <img src="../images/nartBlackVk.svg" />
            </Link>
            <Link to={''}>
              <img src="../images/nartBlackWa.svg" />
            </Link>
          </div>
        </div>
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
      </div>
    </div>
  );
}
