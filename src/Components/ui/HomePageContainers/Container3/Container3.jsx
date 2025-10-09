import React, { useEffect, useMemo, useState } from 'react';
import classes from './Container3.module.css';
import serverConfig from '../../../../serverConfig';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import uploadsConfig from '../../../../uploadsConfig';
import DOMPurify from 'dompurify';

export default function Container3() {
  const navigate = useNavigate();

  const [news, setNews] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [newsRes] = await Promise.all([
          axios.get(`${serverConfig}/news`),
        ]);

        const sortedNews = [...newsRes.data].sort(
          (a, b) => new Date(b.date) - new Date(a.date)
        );

        setNews(sortedNews.slice(0, 3));
      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
      }
    };

    fetchData();
  }, []);

  const latest = useMemo(() => news[1] || null, [news]);

  const fmtDate = (iso) =>
    iso
      ? new Intl.DateTimeFormat('ru-RU', {
          day: '2-digit',
          month: 'long',
        }).format(new Date(iso))
      : '';

  const getImage = (n) =>
    Array.isArray(n?.images) && n.images[0]
      ? `${uploadsConfig}${n.images[0]}`
      : '/images/news-fallback.jpg';

  // (необязательно) Хук: ссылки открывать в новой вкладке
  useEffect(() => {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }, []);

  const safeHtml = useMemo(() => {
    const html = latest?.description || '';
    return DOMPurify.sanitize(html, {
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
  }, [latest]);

  return (
    <div className={classes.container}>
      <div className={classes.containerBlock}>
        <div className={classes.containerBlockTitle}>
          <span>НОВОСТИ</span>
          <span onClick={() => navigate('/news')}>СМОТРЕТЬ ВСЕ</span>
        </div>

        {latest && (
          <div
            className={classes.containerBlockCard}
            onClick={() => navigate(`/news/${latest.id}`)}
            role="button"
          >
            <img src={getImage(latest)} alt={latest.title || 'Новость'} />
            {/* при желании — дата/заголовок */}
            <div className={classes.containerBlockCardInfo}>
              <span className={classes.datePill}>{fmtDate(latest.date)}</span>
              <span className={classes.cardTitle}>{latest.title}</span>
              <div
                className={classes.richText}
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />
            </div>
          </div>
        )}

        <div className={classes.containerBlockNews}>
          {news.map((el) => (
            <div
              className={classes.card}
              key={el.id}
              onClick={() => navigate(`/news/${el.id}`)}
            >
              <img src={`${uploadsConfig}${el.images[0]}`} />
              <div className={classes.cardBottom}>
                <span>{fmtDate(el.date)}</span>
                <span>{el.title}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
