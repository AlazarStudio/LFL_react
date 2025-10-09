import React, { useEffect, useMemo, useState } from 'react';
import classes from './NewsPage.module.css';
import axios from 'axios';
import DOMPurify from 'dompurify';
import serverConfig from '../../../serverConfig';
import uploadsConfig from '../../../uploadsConfig';
import { useNavigate, useSearchParams } from 'react-router-dom';

const PAGE_SIZE = 12;

export default function NewsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const navigate = useNavigate();

  const [searchParams, setSearchParams] = useSearchParams();
  const initialPage = Math.max(
    1,
    parseInt(searchParams.get('page') || '1', 10)
  );
  const [page, setPage] = useState(initialPage);

  useEffect(() => {
    let alive = true;

    // ссылки из описания открываем в новой вкладке
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
        if (alive) setList(data);
      } catch (e) {
        if (alive) setErr('Не удалось загрузить новости');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // если список обновился и текущая страница стала вне диапазона — откатим
  useEffect(() => {
    const total = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (page > total) setPage(total);
    if (page < 1) setPage(1);
  }, [list.length, page]);

  // синхронизация страницы с URL
  useEffect(() => {
    setSearchParams({ page: String(page) }, { replace: true });
  }, [page, setSearchParams]);

  const fmtDate = (iso) =>
    iso
      ? new Intl.DateTimeFormat('ru-RU', {
          day: '2-digit',
          month: 'long',
          // year: 'numeric',
        }).format(new Date(iso))
      : '';

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(list.length / PAGE_SIZE)),
    [list.length]
  );

  const pageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return list.slice(start, start + PAGE_SIZE);
  }, [list, page]);

  if (loading) return <div className={classes.container}>Загрузка…</div>;
  if (err) return <div className={classes.container}>{err}</div>;
  if (!list.length)
    return <div className={classes.container}>Новостей пока нет</div>;

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        <span className={classes.containerTitle}>НОВОСТИ</span>

        <div className={classes.list}>
          {pageSlice.map((news) => {
            const img =
              Array.isArray(news?.images) && news.images[0]
                ? `${uploadsConfig}${news.images[0]}`
                : null;

            const safeHtml = DOMPurify.sanitize(news?.description || '', {
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

            return (
              <article
                key={news.id}
                className={classes.card}
                onClick={() => navigate(`/news/${news.id}`)}
              >
                {img && (
                  <div className={classes.media}>
                    <img src={img} alt={news.title || 'Новость'} />
                  </div>
                )}

                <div className={classes.content}>
                  <div className={classes.meta}>
                    <time dateTime={news.date}>{fmtDate(news.date)}</time>
                  </div>

                  {news.title && (
                    <span className={classes.title}>{news.title}</span>
                  )}

                  {/* Если нужно показывать HTML-описание — раскомментируй */}
                  {/* <div
                  className={classes.description}
                  dangerouslySetInnerHTML={{ __html: safeHtml }}
                /> */}
                </div>
              </article>
            );
          })}
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
      </div>
    </div>
  );
}
