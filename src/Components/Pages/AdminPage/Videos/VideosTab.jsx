import React, { useEffect, useMemo, useRef, useState } from 'react';
import serverConfig from '../../../../serverConfig';
import uploadsConfig from '../../../../uploadsConfig';
import './MediaTab.css';

const API_VIDEOS = `${serverConfig}/videos`;
const API_UPLOAD = `${serverConfig}/upload-videos`;
const API_LEAGUES = `${serverConfig}/leagues`;
const API_MATCHES = `${serverConfig}/matches`;
const API_TOURNAMENTS = `${serverConfig}/tournaments`;

const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');

function buildSrc(pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${ASSETS_BASE}${pathOrUrl}`;
}

function toDateTimeInputValue(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
function dtLoc(s) {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return String(s || '');
  }
}

function matchLabel(m) {
  const left = m.team1?.title || `#${m.team1Id}`;
  const right = m.team2?.title || `#${m.team2Id}`;
  const dt = toDateTimeInputValue(m.date).replace('T', ' ');
  return `${left} — ${right}${dt ? ` • ${dt}` : ''} (#${m.id})`;
}

export default function VideosTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    id: null,
    title: '',
    date: '',
    url: '', // внешняя ссылка (YouTube и т.п.)
    videos: [], // локально загруженные файлы
    leagueId: '',
    matchId: '',
    tournamentId: '',
  });
  const isEdit = useMemo(() => form.id != null, [form.id]);

  // справочники
  const [leagues, setLeagues] = useState([]);
  const [matches, setMatches] = useState([]);
  const [tournaments, setTournaments] = useState([]);

  // refs
  const videosInputRef = useRef(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        range: JSON.stringify([0, 199]),
        sort: JSON.stringify(['date', 'DESC']),
        filter: JSON.stringify(q ? { q } : {}),
        include: 'league,match,tournament',
      });
      const res = await fetch(`${API_VIDEOS}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError('Не удалось загрузить видеозаписи');
    } finally {
      setLoading(false);
    }
  }

  async function loadLeagues() {
    try {
      const params = new URLSearchParams({
        range: JSON.stringify([0, 999]),
        sort: JSON.stringify(['startDate', 'DESC']),
        filter: JSON.stringify({}),
      });
      const res = await fetch(`${API_LEAGUES}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLeagues(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('loadLeagues:', e);
    }
  }
  async function loadMatches(leagueIdForFilter = '') {
    try {
      const filter = {};
      if (leagueIdForFilter) filter.leagueId = Number(leagueIdForFilter);
      const params = new URLSearchParams({
        range: JSON.stringify([0, 999]),
        sort: JSON.stringify(['date', 'DESC']),
        filter: JSON.stringify(filter),
        include: 'team1,team2',
      });
      const res = await fetch(`${API_MATCHES}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setMatches(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('loadMatches:', e);
    }
  }
  async function loadTournaments() {
    try {
      const params = new URLSearchParams({
        range: JSON.stringify([0, 999]),
        sort: JSON.stringify(['startDate', 'DESC']),
        filter: JSON.stringify({}),
      });
      const res = await fetch(`${API_TOURNAMENTS}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setTournaments(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('loadTournaments:', e);
    }
  }

  useEffect(() => {
    load();
    loadLeagues();
    loadMatches();
    loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    load();
  }, [q]);
  useEffect(() => {
    loadMatches(form.leagueId || '');
    setForm((s) => ({ ...s, matchId: '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.leagueId]);

  function resetForm() {
    setForm({
      id: null,
      title: '',
      date: '',
      url: '',
      videos: [],
      leagueId: '',
      matchId: '',
      tournamentId: '',
    });
    setError('');
    if (videosInputRef.current) videosInputRef.current.value = '';
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(row) {
    setForm({
      id: row.id,
      title: row.title || '',
      date: toDateTimeInputValue(row.date),
      url: row.url || '',
      videos: Array.isArray(row.videos) ? row.videos : [],
      leagueId: row.leagueId ?? '',
      matchId: row.matchId ?? '',
      tournamentId: row.tournamentId ?? '',
    });
    setError('');
    setShowForm(true);
    loadMatches(row.leagueId ?? '');
  }

  // upload
  async function uploadMany(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return [];
    const fd = new FormData();
    files.forEach((f) => fd.append('videos', f));
    const res = await fetch(API_UPLOAD, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        data?.error || data?.message || `Upload HTTP ${res.status}`
      );
    const urls = Array.isArray(data.filePaths) ? data.filePaths : [];
    if (!urls.length) throw new Error('Сервер не вернул пути к файлам');
    return urls;
  }

  async function onUploadVideos(e) {
    try {
      setLoading(true);
      setError('');
      const urls = await uploadMany(e.target.files);
      setForm((s) => ({ ...s, videos: [...s.videos, ...urls] }));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Не удалось загрузить видео');
    } finally {
      setLoading(false);
      if (videosInputRef.current) videosInputRef.current.value = '';
    }
  }

  function removeVideo(url) {
    setForm((s) => ({ ...s, videos: s.videos.filter((u) => u !== url) }));
  }

  async function save(e) {
    e.preventDefault();
    setError('');

    const payload = {
      title: form.title || null,
      date: form.date ? new Date(form.date).toISOString() : null,
      url: form.url || null,
      videos: form.videos,
      leagueId: form.leagueId ? Number(form.leagueId) : null,
      matchId: form.matchId ? Number(form.matchId) : null,
      tournamentId: form.tournamentId ? Number(form.tournamentId) : null,
    };

    try {
      const url = isEdit ? `${API_VIDEOS}/${form.id}` : API_VIDEOS;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const maybeText = await res.text();
      if (!res.ok) {
        console.error('Save error:', res.status, maybeText);
        setError('Не удалось сохранить видеозапись.');
        return;
      }
      resetForm();
      setShowForm(false);
      await load();
    } catch (e2) {
      console.error(e2);
      setError('Не удалось сохранить видеозапись');
    }
  }

  async function remove(id) {
    if (!window.confirm('Удалить видеозапись?')) return;
    try {
      setError('');
      const res = await fetch(`${API_VIDEOS}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      console.error(e);
      setError('Не удалось удалить запись');
    }
  }

  return (
    <div className="media">
      <header className="media__header">
        <h1 className="media__title">Видео</h1>

        <div className="media__search">
          <input
            className="input"
            placeholder="Поиск по названию…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn" onClick={load} disabled={loading}>
            Обновить
          </button>
        </div>

        <div className="media__actions">
          <button onClick={startCreate} disabled={loading}>
            Добавить видео
          </button>
        </div>
      </header>

      {error && <div className="alert alert--error">{error}</div>}

      {showForm && (
        <section className="card">
          <form className="form" onSubmit={save}>
            <div className="form__row">
              <label className="field">
                <span className="field__label">Название (опц.)</span>
                <input
                  className="input"
                  value={form.title || ''}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, title: e.target.value }))
                  }
                  placeholder="Например: Обзор матча"
                />
              </label>
              <label className="field">
                <span className="field__label">Дата (опц.)</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.date || ''}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, date: e.target.value }))
                  }
                />
              </label>
            </div>

            {/* Привязки */}
            <div className="form__row">
              <label className="field">
                <span className="field__label">Лига</span>
                <select
                  className="input"
                  value={form.leagueId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, leagueId: e.target.value }))
                  }
                >
                  <option value="">— не выбрано —</option>
                  {leagues.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.title} {l.season ? `(${l.season})` : ''} #{l.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Матч</span>
                <select
                  className="input"
                  value={form.matchId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, matchId: e.target.value }))
                  }
                  disabled={!matches.length}
                >
                  <option value="">— не выбрано —</option>
                  {matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {matchLabel(m)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Турнир</span>
                <select
                  className="input"
                  value={form.tournamentId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, tournamentId: e.target.value }))
                  }
                >
                  <option value="">— не выбрано —</option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title || `Турнир #${t.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Внешняя ссылка + локальные видео */}
            <div className="form__row">
              <label className="field field--grow">
                <span className="field__label">Ссылка на видео (опц.)</span>
                <input
                  className="input"
                  placeholder="https://youtu.be/… или другая внешняя ссылка"
                  value={form.url || ''}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, url: e.target.value }))
                  }
                />
              </label>
            </div>

            <div className="form__row">
              <label className="field field--grow">
                <span className="field__label">Загрузить файлы (локально)</span>
                <div className="upload">
                  <input
                    ref={videosInputRef}
                    type="file"
                    accept="video/*"
                    multiple
                    onChange={onUploadVideos}
                    className="upload__input"
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => videosInputRef.current?.click()}
                    disabled={loading}
                  >
                    Выбрать файлы
                  </button>
                </div>

                {form.videos.length > 0 && (
                  <div className="thumbs">
                    {form.videos.map((url) => (
                      <div className="thumb" key={url}>
                        <video
                          src={buildSrc(url)}
                          className="video-thumb"
                          controls
                        />
                        <button
                          type="button"
                          className="thumb__remove"
                          onClick={() => removeVideo(url)}
                          title="Удалить"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </label>
            </div>

            <div className="form__actions">
              <button
                className="btn btn--primary"
                type="submit"
                disabled={loading}
              >
                {isEdit ? 'Сохранить' : 'Добавить'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  resetForm();
                  setShowForm(false);
                }}
              >
                Отмена
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <div className="table">
          <div className="table__head">
            <div style={{ width: 70 }}>ID</div>
            <div style={{ width: 180 }}>Дата</div>
            <div style={{ minWidth: 260 }}>Название / Привязки</div>
            <div style={{ width: 200 }}>Вложения</div>
            <div style={{ width: 220 }}>Действия</div>
          </div>
          <div className="table__body">
            {loading && <div className="table__row muted">Загрузка…</div>}
            {!loading && rows.length === 0 && (
              <div className="table__row muted">Нет записей</div>
            )}
            {!loading &&
              rows.map((r) => (
                <div className="table__row" key={r.id}>
                  <div>#{r.id}</div>
                  <div>{r.date ? dtLoc(r.date) : '—'}</div>
                  <div className="cell-strong">
                    {r.title || 'Без названия'}
                    <div className="muted" style={{ marginTop: 4 }}>
                      Лига:{' '}
                      {r.league?.title
                        ? `${r.league.title} (#${r.leagueId})`
                        : r.leagueId
                        ? `#${r.leagueId}`
                        : '—'}
                      {' · '}Матч: {r.matchId ? `#${r.matchId}` : '—'}
                      {' · '}Турнир:{' '}
                      {r.tournament?.title
                        ? `${r.tournament.title} (#${r.tournamentId})`
                        : r.tournamentId
                        ? `#${r.tournamentId}`
                        : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="muted">
                      URL:{' '}
                      {r.url ? (
                        <a href={r.url} target="_blank" rel="noreferrer">
                          открыть
                        </a>
                      ) : (
                        '—'
                      )}
                    </div>
                    <div className="muted">
                      Файлов: {Array.isArray(r.videos) ? r.videos.length : 0}
                    </div>
                    {/* {Array.isArray(r.videos) && r.videos.length > 0 && (
                      <div className="thumbs thumbs--mini">
                        {r.videos.slice(0, 2).map((u) => (
                          <video
                            key={u}
                            src={buildSrc(u)}
                            className="video-thumb video-thumb--mini"
                          />
                        ))}
                        {r.videos.length > 2 && (
                          <span className="muted">+{r.videos.length - 2}</span>
                        )}
                      </div>
                    )} */}
                  </div>
                  <div className="table__actions">
                    <button
                      className="btn btn--sm"
                      onClick={() => startEdit(r)}
                    >
                      Редактировать
                    </button>
                    <button
                      className="btn btn--sm btn--danger"
                      onClick={() => remove(r.id)}
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
