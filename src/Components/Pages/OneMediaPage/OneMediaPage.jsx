import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import classes from './OneMediaPage.module.css';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import serverConfig from '../../../serverConfig'; // например: http://localhost:5000/api
import uploadsConfig from '../../../uploadsConfig'; // например: http://localhost:5000

const PAGE_SIZE = 12;
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');
const buildSrc = (p) =>
  !p ? '' : /^https?:\/\//i.test(p) ? p : `${ASSETS_BASE}${p}`;

export default function OneMediaPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [album, setAlbum] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr('');
    (async () => {
      try {
        const { data } = await axios.get(`${serverConfig}/images/${id}`);
        if (!alive) return;
        setAlbum(data || null);
      } catch (e) {
        if (!alive) return;
        setErr('Альбом не найден');
        setAlbum(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const photos = useMemo(() => {
    const arr = Array.isArray(album?.images)
      ? album.images.filter(Boolean)
      : [];
    return arr.map(buildSrc);
  }, [album]);

  const initialPage = Math.max(
    1,
    parseInt(searchParams.get('page') || '1', 10)
  );
  const [page, setPage] = useState(initialPage);
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(photos.length / PAGE_SIZE)),
    [photos.length]
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  useEffect(() => {
    setSearchParams({ page: String(page) }, { replace: true });
  }, [page, setSearchParams]);

  const pageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return photos
      .slice(start, start + PAGE_SIZE)
      .map((src, i) => ({ src, globalIndex: start + i }));
  }, [photos, page]);

  // Лайтбокс
  const [isOpen, setIsOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const openAt = useCallback((globalIndex) => {
    setIdx(globalIndex);
    setIsOpen(true);
  }, []);
  const close = useCallback(() => setIsOpen(false), []);
  const prev = useCallback(
    () => setIdx((i) => (i - 1 + photos.length) % photos.length),
    [photos.length]
  );
  const next = useCallback(
    () => setIdx((i) => (i + 1) % photos.length),
    [photos.length]
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close, prev, next]);

  if (loading) return <div className={classes.container}>Загрузка…</div>;
  if (err || !album) {
    return (
      <div className={classes.container}>
        <div className={classes.notFound}>
          {err || 'Альбом не найден'}
          <button
            className={classes.backBtn}
            onClick={() => navigate('/media')}
          >
            К альбомам
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        <div className={classes.header}>
          <div className={classes.headRight}>
            <h1 className={classes.title}>{album.title || 'Альбом'}</h1>
          </div>
          <button
            className={classes.backBtn}
            onClick={() => navigate('/media')}
          >
            К альбомам
          </button>
        </div>
        {album.date && (
          <span className={classes.date}>
            {isNaN(Date.parse(album.date))
              ? album.date
              : new Date(album.date).toLocaleDateString()}
          </span>
        )}

        <div className={classes.grid}>
          {pageSlice.map(({ src, globalIndex }) => (
            <div
              key={`${album.id}-${globalIndex}`}
              className={classes.tile}
              onClick={() => openAt(globalIndex)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && openAt(globalIndex)}
              title="Открыть фото"
            >
              <img src={src} alt={`Фото ${globalIndex + 1}`} loading="lazy" />
            </div>
          ))}
          {pageSlice.length === 0 && (
            <div className={classes.empty}>
              В этом альбоме пока нет фотографий
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <nav className={classes.pagination} aria-label="Пагинация">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={`${classes.pageBtn} ${
                  n === page ? classes.active : ''
                }`}
                onClick={() => setPage(n)}
                aria-current={n === page ? 'page' : undefined}
              >
                {n}
              </button>
            ))}
          </nav>
        )}

        {isOpen && photos.length > 0 && (
          <div className={classes.lightbox} onClick={close}>
            <div
              className={classes.lbInner}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={classes.lbClose}
                onClick={close}
                aria-label="Закрыть"
              >
                ✕
              </button>
              <button
                className={classes.lbPrev}
                onClick={prev}
                aria-label="Предыдущее"
              >
                ‹
              </button>
              <img
                className={classes.lbImage}
                src={photos[idx]}
                alt={`Фото ${idx + 1}`}
              />
              <button
                className={classes.lbNext}
                onClick={next}
                aria-label="Следующее"
              >
                ›
              </button>
              <div className={classes.lbCounter}>
                {idx + 1} / {photos.length}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
