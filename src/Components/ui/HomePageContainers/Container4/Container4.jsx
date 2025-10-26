import React, { useEffect, useState, useCallback, useMemo } from 'react';
import classes from './Container4.module.css';
import { useNavigate } from 'react-router-dom';
import serverConfig from '../../../../serverConfig';

export default function Container4() {
  const navigate = useNavigate();

  /* --------- базовый хост для статики --------- */
  const ASSETS_BASE = useMemo(
    () => String(serverConfig || '').replace(/\/api\/?$/, ''),
    []
  );
  const buildSrc = useCallback(
    (p) => (!p ? '' : /^https?:\/\//i.test(p) ? p : `${ASSETS_BASE}${p}`),
    [ASSETS_BASE]
  );

  /* ===================== ФОТО (GET /images) ===================== */
  const [albums, setAlbums] = useState([]);
  const [isLoadingAlbums, setIsLoadingAlbums] = useState(false);
  const [albumsError, setAlbumsError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoadingAlbums(true);
        setAlbumsError('');
        const res = await fetch(`${serverConfig}/images`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
          ? data.items
          : [];

        const normalized = raw.map((alb, i) => {
          const rawImgs = Array.isArray(alb?.images)
            ? alb.images
            : Array.isArray(alb?.imgs)
            ? alb.imgs
            : [];
          const imgs = rawImgs
            .map((x) => (typeof x === 'string' ? x : x?.src || x?.url || ''))
            .filter(Boolean)
            .map(buildSrc);
          const createdAt =
            (alb?.createdAt && Date.parse(alb.createdAt)) ||
            (alb?.date && Date.parse(alb.date)) ||
            0;

          return {
            id: String(
              alb?.id ??
                alb?._id ??
                alb?.slug ??
                (alb?.title ? `alb-${alb.title}-${i}` : `alb-${i}`)
            ),
            title: alb?.title || '',
            images: imgs,
            createdAt,
          };
        });

        if (!cancelled) setAlbums(normalized);
      } catch (e) {
        if (!cancelled) setAlbumsError(String(e?.message || e));
      } finally {
        if (!cancelled) setIsLoadingAlbums(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildSrc]);

  // последние 6 по дате (если есть), иначе по порядку
  const imagesArrFiltered = useMemo(() => {
    const ok = albums.filter(
      (alb) => Array.isArray(alb.images) && !!alb.images[0]
    );
    const sorted = [...ok].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    return (sorted.length ? sorted : ok).slice(0, 6);
  }, [albums]);

  /* ===================== ВИДЕО (GET /videos) ===================== */
  const [videosApi, setVideosApi] = useState([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [videosError, setVideosError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setIsLoadingVideos(true);
        setVideosError('');
        const res = await fetch(`${serverConfig}/videos`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
          ? data.items
          : [];

        const normalized = raw
          .map((v, i) => {
            const rawSrc =
              v?.src ||
              v?.video ||
              v?.url ||
              (Array.isArray(v?.videos) && v.videos.find(Boolean)) ||
              v?.file ||
              '';
            const createdAt =
              (v?.createdAt && Date.parse(v.createdAt)) ||
              (v?.date && Date.parse(v.date)) ||
              0;

            return {
              id: String(
                v?.id ??
                  v?._id ??
                  v?.slug ??
                  (v?.title ? `vid-${v.title}-${i}` : `vid-${i}`)
              ),
              title: v?.title || '',
              src: buildSrc(rawSrc),
              createdAt,
            };
          })
          .filter((v) => !!v.src);

        if (!cancelled) setVideosApi(normalized);
      } catch (e) {
        if (!cancelled) setVideosError(String(e?.message || e));
      } finally {
        if (!cancelled) setIsLoadingVideos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [buildSrc]);

  // последние 3 по дате (если есть), иначе по порядку
  const videosArrPlayable = useMemo(() => {
    const sorted = [...videosApi].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
    return (sorted.length ? sorted : videosApi).slice(0, 3);
  }, [videosApi]);

  /* ===================== Лайтбокс (фото) ===================== */
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [albumImages, setAlbumImages] = useState([]);
  const [photoIndex, setPhotoIndex] = useState(0);

  const openAlbum = useCallback((album) => {
    const imgs = Array.isArray(album?.images)
      ? album.images.filter(Boolean)
      : [];
    if (!imgs.length) return;
    setAlbumImages(imgs);
    setPhotoIndex(0);
    setIsLightboxOpen(true);
  }, []);
  const closeLightbox = useCallback(() => {
    setIsLightboxOpen(false);
    setAlbumImages([]);
    setPhotoIndex(0);
  }, []);
  const prevPhoto = useCallback(
    () =>
      setPhotoIndex((i) => (i - 1 + albumImages.length) % albumImages.length),
    [albumImages.length]
  );
  const nextPhoto = useCallback(
    () => setPhotoIndex((i) => (i + 1) % albumImages.length),
    [albumImages.length]
  );

  useEffect(() => {
    if (!isLightboxOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') prevPhoto();
      if (e.key === 'ArrowRight') nextPhoto();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isLightboxOpen, closeLightbox, prevPhoto, nextPhoto]);

  /* ===================== Модалка-плеер (видео) ===================== */
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [activeVideo, setActiveVideo] = useState({ src: '', title: '' });

  const openVideo = useCallback((v) => {
    if (!v?.src) return;
    setActiveVideo({ src: v.src, title: v.title || '' });
    setIsVideoOpen(true);
  }, []);
  const closeVideo = useCallback(() => {
    setIsVideoOpen(false);
    setActiveVideo({ src: '', title: '' });
  }, []);
  useEffect(() => {
    if (!isVideoOpen) return;
    const onKey = (e) => e.key === 'Escape' && closeVideo();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isVideoOpen, closeVideo]);

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        {/* ===== ФОТО ===== */}
        {isLoadingAlbums && (
          <div className={classes.loading}>Загрузка альбомов…</div>
        )}
        {!!albumsError && (
          <div className={classes.error}>Ошибка: {albumsError}</div>
        )}

        {imagesArrFiltered.length > 0 && !isLoadingAlbums && !albumsError && (
          <div className={classes.containerBlockImages}>
            <div className={classes.containerBlockTitle}>
              <span>ФОТО</span>
              <span onClick={() => navigate('/albums')}>СМОТРЕТЬ ВСЕ</span>
            </div>
            <span className={classes.containerBlockLine}></span>

            <div className={classes.containerBlockImagesArr}>
              {imagesArrFiltered.map((el) => (
                <div
                  className={classes.card}
                  key={el.id}
                  onClick={() => openAlbum(el)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && openAlbum(el)}
                  title={el.title || 'Открыть фотоальбом'}
                >
                  <img src={el.images[0]} alt={el.title || 'album cover'} />
                  <div className={classes.cardOverlay}>
                    <span className={classes.zoomIcon}>🔍</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== ВИДЕО (единый постер + ▶ → модальный плеер) ===== */}
        {isLoadingVideos && (
          <div className={classes.loading}>Загрузка видео…</div>
        )}
        {!!videosError && (
          <div className={classes.error}>Ошибка: {videosError}</div>
        )}

        {videosArrPlayable.length > 0 && !isLoadingVideos && !videosError && (
          <div className={classes.containerBlockVideo}>
            <div className={classes.containerBlockTitle}>
              <span>ВИДЕО</span>
              <span onClick={() => navigate('/videos')}>СМОТРЕТЬ ВСЕ</span>
            </div>
            <span className={classes.containerBlockLine}></span>

            <div className={classes.containerBlockVideosArr}>
              {videosArrPlayable.map((el) => (
                <div
                  key={el.id}
                  className={classes.card}
                  onClick={() => openVideo(el)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && openVideo(el)}
                  title={el.title || 'Смотреть видео'}
                >
                  <img src={`../images/LFLbgFooter.png`} alt={el.title || 'video poster'} />
                  <div className={classes.videoShade}></div>
                  <div className={classes.playBadge}>▶</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ===== Лайтбокс (фото) ===== */}
      {isLightboxOpen && (
        <div className={classes.lightbox} onClick={closeLightbox}>
          <div className={classes.lbInner} onClick={(e) => e.stopPropagation()}>
            <button
              className={classes.lbClose}
              onClick={closeLightbox}
              aria-label="Закрыть"
            >
              ✕
            </button>
            <button
              className={classes.lbPrev}
              onClick={prevPhoto}
              aria-label="Предыдущее"
            >
              ‹
            </button>
            <img
              className={classes.lbImage}
              src={albumImages[photoIndex]}
              alt={`photo ${photoIndex + 1}`}
            />
            <button
              className={classes.lbNext}
              onClick={nextPhoto}
              aria-label="Следующее"
            >
              ›
            </button>
            <div className={classes.lbCounter}>
              {photoIndex + 1} / {albumImages.length}
            </div>
          </div>
        </div>
      )}

      {/* ===== Модалка-плеер (видео) ===== */}
      {isVideoOpen && (
        <div className={classes.videobox} onClick={closeVideo}>
          <div className={classes.vbInner} onClick={(e) => e.stopPropagation()}>
            <button
              className={classes.vbClose}
              onClick={closeVideo}
              aria-label="Закрыть"
            >
              ✕
            </button>
            <video
              key={activeVideo.src}
              className={classes.vbVideo}
              src={activeVideo.src}
              controls
              autoPlay
              playsInline
              preload="none" /* чтобы не грузить заранее */
            />
            {activeVideo.title && (
              <div className={classes.vbTitle}>{activeVideo.title}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
