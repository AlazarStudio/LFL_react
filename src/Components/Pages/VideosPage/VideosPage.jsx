// src/Components/Pages/Videos/VideosPage.jsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import classes from './VideosPage.module.css'; // подключи CSS из сообщения (или скопируй из MediaPage и добавь блоки для плеера)
import serverConfig from '../../../serverConfig'; // напр.: http://localhost:5000/api
import uploadsConfig from '../../../uploadsConfig'; // напр.: http://localhost:5000

const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');
const buildSrc = (p) =>
  !p ? '' : /^https?:\/\//i.test(p) ? p : `${ASSETS_BASE}${p}`;

export default function VideosPage() {
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // модальный плеер
  const [isOpen, setIsOpen] = useState(false);
  const [active, setActive] = useState({ src: '', title: '', poster: '' });

  const openPlayer = useCallback((v) => {
    if (!v?.src) return;
    setActive({ src: v.src, title: v.title || '', poster: v.poster || '' });
    setIsOpen(true);
  }, []);

  const closePlayer = useCallback(() => {
    setIsOpen(false);
    setActive({ src: '', title: '', poster: '' });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === 'Escape' && closePlayer();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closePlayer]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await axios.get(`${serverConfig}/videos`);
        const raw = Array.isArray(data)
          ? data
          : Array.isArray(data?.items)
          ? data.items
          : [];
        const normalized = raw
          .map((v, i) => {
            const src =
              v?.src ||
              v?.video ||
              v?.url ||
              v?.file ||
              (Array.isArray(v?.videos) && v.videos.find(Boolean)) ||
              '';
            const poster = v?.poster || v?.thumbnail || v?.cover || '';
            return {
              id: String(v?.id ?? v?._id ?? v?.slug ?? `vid-${i}`),
              title: v?.title || '',
              date: v?.date || v?.createdAt || null,
              src: buildSrc(src),
              poster: buildSrc(poster),
            };
          })
          .filter((x) => !!x.src);
        if (alive) setVideos(normalized);
      } catch (e) {
        if (alive) setErr('Не удалось загрузить видео');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div className={classes.container}>Загрузка…</div>;
  if (err) return <div className={classes.container}>{err}</div>;

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        <div className={classes.containerBlockTitle}>
          <span>ВИДЕО</span>
        </div>

        <div className={classes.containerBlockVideosArr}>
          {videos.map((el) => {
            const thumb = el.poster || '../images/LFLbgFooter.png';
            return (
              <div
                key={el.id}
                className={classes.card}
                onClick={() => openPlayer(el)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && openPlayer(el)}
                title={el.title || 'Смотреть видео'}
              >
                <div className={classes.videoPlaceholder}>
                  {thumb ? (
                    <>
                      <img
                        src={thumb}
                        alt={el.title || 'video poster'}
                        loading="lazy"
                      />
                      <div className={classes.videoShade} />
                      <div className={classes.playBadge}>▶</div>
                    </>
                  ) : (
                    <div className={classes.noPoster}>Видео</div>
                  )}
                </div>
                <div className={classes.cardInfo}>
                  <span>{el.title}</span>
                  <span>
                    {el.date ? new Date(el.date).toLocaleDateString() : ''}
                  </span>
                </div>
              </div>
            );
          })}
          {!videos.length && <div>Видео пока нет</div>}
        </div>
      </div>

      {/* Модальный плеер */}
      {isOpen && (
        <div className={classes.videobox} onClick={closePlayer}>
          <div className={classes.vbInner} onClick={(e) => e.stopPropagation()}>
            <button
              className={classes.vbClose}
              onClick={closePlayer}
              aria-label="Закрыть"
            >
              ✕
            </button>
            <video
              key={active.src}
              className={classes.vbVideo}
              src={active.src}
              poster={active.poster || undefined}
              controls
              autoPlay
              playsInline
              preload="metadata"
            />
            {active.title && (
              <div className={classes.vbTitle}>{active.title}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
