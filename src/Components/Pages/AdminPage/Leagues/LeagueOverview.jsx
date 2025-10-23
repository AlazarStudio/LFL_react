import React, { useEffect, useState } from 'react';
import serverConfig from '../../../../serverConfig';
import './LeagueOverview.css';

const API = `${serverConfig}/leagues`;

function toDateStr(val) {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function LeagueOverview({
  leagueId,
  league,
  assetsBase,
  onReload,
}) {
  const [item, setItem] = useState(league || null);

  useEffect(() => {
    setItem(league || null);
  }, [league]);

  return (
    <div className="card">
      {!item ? (
        <div className="muted">Загрузка…</div>
      ) : (
        <>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16 }}
          >
            <div className="info">
              <div>
                <b>Название:</b> {item.title}
              </div>
              <div>
                <b>Сезон:</b> {item.season || '—'}
              </div>
              <div>
                <b>Город:</b> {item.city || '—'}
              </div>
              <div>
                <b>Формат:</b>{' '}
                {(item.format || '').replace('F', '').replace('x', '×') || '—'}
              </div>
              <div>
                <b>Минут в тайме:</b> {item.halfMinutes ?? 45}
              </div>
              <div>
                <b>Таймов:</b> {item.halves ?? 2}
              </div>
              <div>
                <b>Старт:</b> {toDateStr(item.startDate)}
              </div>
              <div>
                <b>Дедлайн регистрации:</b>{' '}
                {toDateStr(item.registrationDeadline)}
              </div>
            </div>

            <div>
              <b>Изображения:</b>
              <div className="thumbs" style={{ marginTop: 8 }}>
                {(item.images || []).map((u) => (
                  <div className="thumb" key={u}>
                    <img
                      src={/^https?:/.test(u) ? u : `${assetsBase}${u}`}
                      alt=""
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
