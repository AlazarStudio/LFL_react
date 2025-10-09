import React, { useEffect, useState, useCallback, useMemo } from 'react';
import classes from './Container4.module.css';
import { images, videos } from '../../../../../bd';
import { useNavigate } from 'react-router-dom';

export default function Container4() {
  const navigate = useNavigate();

  // ——— Лимит видео по ширине экрана: ≤768px -> 4, иначе 3 ———
  const [videoLimit, setVideoLimit] = useState(3);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setVideoLimit(e.matches ? 4 : 3);
    onChange(mq);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ——— Фильтруем фото-альбомы: берём до 6 и только те, где есть хотя бы одна картинка ———
  const imagesArrFiltered = useMemo(
    () =>
      images
        .slice(0, 6)
        .filter((alb) => Array.isArray(alb?.images) && !!alb.images[0]),
    []
  );

  // ——— Берём N видео и оставляем только с валидным src ———
  const getVideoSrc = useCallback(
    (v) =>
      v?.video || v?.url || (Array.isArray(v?.videos) && v.videos[0]) || '',
    []
  );

  const videosArrPlayable = useMemo(() => {
    const sliced = videos.slice(0, videoLimit);
    return sliced.filter((v) => !!getVideoSrc(v));
  }, [videoLimit, getVideoSrc]);

  // ——— Лайтбокс для фото ———
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [albumImages, setAlbumImages] = useState([]); // массив ссылок текущего альбома
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

  const prevPhoto = useCallback(() => {
    setPhotoIndex((i) => (i - 1 + albumImages.length) % albumImages.length);
  }, [albumImages.length]);

  const nextPhoto = useCallback(() => {
    setPhotoIndex((i) => (i + 1) % albumImages.length);
  }, [albumImages.length]);

  // ESC / стрелки для лайтбокса
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

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        {/* ——— ФОТО (рендерим секцию только если есть хотя бы один валидный альбом) ——— */}
        {imagesArrFiltered.length > 0 && (
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
                  title="Открыть фотоальбом"
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

        {/* ——— ВИДЕО (рендерим секцию только если есть хотя бы одно проигрываемое видео) ——— */}
        {videosArrPlayable.length > 0 && (
          <div className={classes.containerBlockVideo}>
            <div className={classes.containerBlockTitle}>
              <span>ВИДЕО</span>
              <span onClick={() => navigate('/videos')}>СМОТРЕТЬ ВСЕ</span>
            </div>
            <span className={classes.containerBlockLine}></span>

            <div className={classes.containerBlockVideosArr}>
              {videosArrPlayable.map((el) => {
                const src = getVideoSrc(el);
                const poster = el?.images?.[0];
                return (
                  <div
                    className={classes.card}
                    key={el.id}
                    title={el.title || 'Видео'}
                  >
                    <video
                      className={classes.video}
                      src={src}
                      poster={poster}
                      controls
                      preload="metadata"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ——— Лайтбокс ——— */}
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
    </div>
  );
}
