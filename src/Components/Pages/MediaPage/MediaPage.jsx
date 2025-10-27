import React, { useEffect, useState } from 'react';
import axios from 'axios';
import classes from './MediaPage.module.css';
import serverConfig from '../../../serverConfig'; // напр.: http://localhost:5000/api
import uploadsConfig from '../../../uploadsConfig'; // напр.: http://localhost:5000
import { useNavigate } from 'react-router-dom';

const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');
const buildSrc = (p) =>
  !p ? '' : /^https?:\/\//i.test(p) ? p : `${ASSETS_BASE}${p}`;

export default function MediaPage() {
  const navigate = useNavigate();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await axios.get(`${serverConfig}/images`, {
          // если нужно, добавь пагинацию/фильтры
          // params: { range: '[0,49]', sort: '["date","DESC"]' }
        });
        if (alive) setAlbums(Array.isArray(data) ? data : []);
      } catch (e) {
        if (alive) setErr('Не удалось загрузить альбомы');
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
        <div className={classes.containerBlockTitle}>АЛЬБОМЫ</div>
        <div className={classes.containerBlockAlbums}>
          {albums.map((el) => {
            const cover = el.cover || el.images?.[0] || '';
            return (
              <div
                className={classes.card}
                key={el.id}
                onClick={() => navigate(`/media/${el.id}`)}
              >
                <img src={buildSrc(cover)} alt={el.title || 'Альбом'} />
                <div className={classes.cardInfo}>
                  <span>{el.title}</span>
                  <span>
                    {el.date ? new Date(el.date).toLocaleDateString() : ''}
                  </span>
                </div>
              </div>
            );
          })}
          {!albums.length && <div>Альбомов пока нет</div>}
        </div>
      </div>
    </div>
  );
}
