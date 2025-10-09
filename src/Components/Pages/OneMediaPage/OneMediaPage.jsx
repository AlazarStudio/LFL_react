import React, { useEffect, useMemo, useState, useCallback } from 'react';
import classes from './OneMediaPage.module.css';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { images as albums } from '../../../../bd'; // ⚠️ проверь путь

const PAGE_SIZE = 12;

export default function OneMediaPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  // альбом
  const album = useMemo(
    () =>
      Array.isArray(albums)
        ? albums.find((a) => String(a.id) === String(id))
        : null,
    [id]
  );

  const photos = useMemo(
    () => (Array.isArray(album?.images) ? album.images.filter(Boolean) : []),
    [album]
  );

  // страница из URL
  const initialPage = Math.max(
    1,
    parseInt(searchParams.get('page') || '1', 10)
  );
  const [page, setPage] = useState(initialPage);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(photos.length / PAGE_SIZE)),
    [photos.length]
  );

  // следим, чтобы страница была в диапазоне
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
    if (page < 1) setPage(1);
  }, [page, totalPages]);

  // пишем текущую страницу в URL
  useEffect(() => {
    setSearchParams({ page: String(page) }, { replace: true });
  }, [page, setSearchParams]);

  // текущий срез
  const pageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return photos.slice(start, start + PAGE_SIZE).map((src, i) => ({
      src,
      globalIndex: start + i,
    }));
  }, [photos, page]);

  // —— Лайтбокс ——
  const [isOpen, setIsOpen] = useState(false);
  const [idx, setIdx] = useState(0); // глобальный индекс внутри всего альбома

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

  if (!album) {
    return (
      <div className={classes.container}>
        <div className={classes.notFound}>
          Альбом не найден
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
        {album.date && <span className={classes.date}>{album.date}</span>}
        {/* Сетка фотографий */}
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
              <img src={src} alt={`Фото ${globalIndex + 1}`} />
            </div>
          ))}
          {pageSlice.length === 0 && (
            <div className={classes.empty}>
              В этом альбоме пока нет фотографий
            </div>
          )}
        </div>

        {/* Пагинация */}
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

        {/* Лайтбокс */}
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
