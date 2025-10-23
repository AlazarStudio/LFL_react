import React, { useEffect, useState } from 'react';
import serverConfig from '../../../../../serverConfig';

export default function LeagueExportTab({ leagueId }) {
  const [flags, setFlags] = useState({
    schedule: true,
    standings: true,
    scorers: false,
    assistants: false,
    yellows: false,
    reds: false,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // (необязательно) прогрев данных, если нужно
  useEffect(() => {
    setErr('');
  }, [leagueId]);

  const selectedSections = Object.entries(flags)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const downloadDocx = async () => {
    if (!selectedSections.length) return setErr('Выбери хотя бы один раздел');
    setErr('');
    setLoading(true);
    try {
      const qs = encodeURIComponent(selectedSections.join(','));
      const res = await fetch(
        `${serverConfig}/leagues/${leagueId}/export/docx/bundle?sections=${qs}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `league-${leagueId}-export.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      setErr('Не удалось скачать документ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h3>Экспорт (.docx)</h3>
      {err && <div className="alert alert--error">{err}</div>}

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}
      >
        {[
          ['schedule', 'Расписание матчей'],
          ['standings', 'Турнирная таблица'],
          ['scorers', 'Бомбардиры'],
          ['assistants', 'Ассистенты'],
          ['yellows', 'Жёлтые карточки'],
          ['reds', 'Красные карточки'],
        ].map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={(e) =>
                setFlags((s) => ({ ...s, [key]: e.target.checked }))
              }
            />{' '}
            {label}
          </label>
        ))}
      </div>

      <div className="form__actions" style={{ marginTop: 12 }}>
        <button
          className="btn btn--primary"
          onClick={downloadDocx}
          disabled={loading}
        >
          Скачать DOCX
        </button>
      </div>
    </section>
  );
}
