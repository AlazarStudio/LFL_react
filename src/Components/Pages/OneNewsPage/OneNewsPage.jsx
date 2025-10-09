import React, { useEffect, useMemo, useState } from 'react';
import classes from './OneNewsPage.module.css';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import DOMPurify from 'dompurify';
import serverConfig from '../../../serverConfig';
import uploadsConfig from '../../../uploadsConfig';

export default function OneNewsPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [list, setList] = useState([]);
  const [current, setCurrent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;

    // ссылки в описании открываем в новой вкладке
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });

    (async () => {
      try {
        const res = await axios.get(`${serverConfig}/news`);
        const data = Array.isArray(res.data) ? res.data : [];
        data.sort((a, b) => new Date(b.date) - new Date(a.date));

        if (!alive) return;

        setList(data);
        // ищем текущую по id (сравниваем как строки)
        const cur = data.find((n) => String(n.id) === String(id)) || null;
        setCurrent(cur);
      } catch (e) {
        if (alive) setErr('Не удалось загрузить новость');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const fmtDate = (iso) =>
    iso
      ? new Intl.DateTimeFormat('ru-RU', {
          day: '2-digit',
          month: 'long',
          // year: 'numeric',
        }).format(new Date(iso))
      : '';

  const heroSrc = useMemo(() => {
    if (!current?.images || !current.images[0]) return null;
    return `${uploadsConfig}${current.images[0]}`;
  }, [current]);

  const safeHtml = useMemo(() => {
    return DOMPurify.sanitize(current?.description || '', {
      ALLOWED_TAGS: [
        'p',
        'br',
        'strong',
        'em',
        'u',
        's',
        'ul',
        'ol',
        'li',
        'blockquote',
        'a',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'img',
        'span',
      ],
      ALLOWED_ATTR: {
        a: ['href', 'target', 'rel', 'name'],
        img: ['src', 'alt', 'title'],
        span: ['class'],
        p: ['class'],
        h1: ['class'],
        h2: ['class'],
        h3: ['class'],
        h4: ['class'],
        h5: ['class'],
        h6: ['class'],
      },
    });
  }, [current]);

  const more = useMemo(() => {
    // 3 последние, не включая текущую
    return list.filter((n) => String(n.id) !== String(id)).slice(0, 3);
  }, [list, id]);

  if (loading) return <div className={classes.container}>Загрузка…</div>;
  if (err) return <div className={classes.container}>{err}</div>;
  if (!current)
    return (
      <div className={classes.container}>
        <div className={classes.notFound}>
          Новость не найдена
          <button className={classes.backBtn} onClick={() => navigate('/news')}>
            К новостям
          </button>
        </div>
      </div>
    );

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        {/* <div className={classes.metaRow}>
          <button className={classes.backBtn} onClick={() => navigate('/news')}>
            ← Назад к новостям
          </button>
        </div> */}
        <div className={classes.articleWrap}>
          <div className={classes.articleWrapTop}>
            {heroSrc && <img src={heroSrc} alt={current.title || 'Новость'} />}
            <div className={classes.articleWrapInfo}>
              <time className={classes.date} dateTime={current.date}>
                {fmtDate(current.date)}
              </time>
              {current.title && (
                <h1 className={classes.title}>{current.title}</h1>
              )}
            </div>
          </div>
          <div
            className={classes.richText}
            dangerouslySetInnerHTML={{ __html: safeHtml }}
          />
        </div>

        {more.length > 0 && (
          <div className={classes.moreBlock}>
            <div className={classes.moreHeader}>
              <span>ПОХОЖИЕ НОВОСТИ</span>
              <button
                className={classes.allBtn}
                onClick={() => navigate('/news')}
              >
                Смотреть все
              </button>
            </div>

            <div className={classes.cards}>
              {more.map((n) => {
                const img =
                  Array.isArray(n.images) && n.images[0]
                    ? `${uploadsConfig}${n.images[0]}`
                    : null;

                return (
                  <article
                    key={n.id}
                    className={classes.card}
                    onClick={() => navigate(`/news/${n.id}`)}
                  >
                    {img && (
                      <div className={classes.cardMedia}>
                        <img
                          src={img}
                          alt={n.title || 'Новость'}
                          loading="lazy"
                        />
                      </div>
                    )}
                    <div className={classes.cardBody}>
                      <time className={classes.cardDate} dateTime={n.date}>
                        {fmtDate(n.date)}
                      </time>
                      {n.title && (
                        <span className={classes.cardTitle}>{n.title}</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
