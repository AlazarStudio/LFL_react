import React, { useEffect, useMemo, useRef, useState } from 'react';
import serverConfig from '../../../../serverConfig'; // напр. 'http://localhost:5000/api'
import uploadsConfig from '../../../../uploadsConfig'; // напр. 'http://localhost:5000'
import ReactQuill, { Quill } from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import './NewsTab.css';

const API_NEWS = `${serverConfig}/news`;
const API_UPLOAD_IMAGES = `${serverConfig}/upload`; // изображения -> поле 'files'
const API_UPLOAD_VIDEOS = `${serverConfig}/upload-videos`; // видео -> поле 'videos'
const API_LEAGUES = `${serverConfig}/leagues`;
const API_MATCHES = `${serverConfig}/matches`;
const API_TOURNAMENTS = `${serverConfig}/tournaments`;

/* ========= Quill: кастомные форматы/блоки/патчи ========= */
const BlockEmbed = Quill.import('blots/block/embed');
const Link = Quill.import('formats/link');

// <video src="..." controls> (локально загруженное видео)
class LocalVideoBlot extends BlockEmbed {
  static blotName = 'localVideo';
  static tagName = 'video';
  static create(value) {
    const node = super.create();
    node.setAttribute('controls', '');
    node.setAttribute('preload', 'metadata');
    node.setAttribute('src', value);
    node.style.maxWidth = '100%';
    node.style.display = 'block';
    node.style.background = '#000';
    return node;
  }
  static value(node) {
    return node.getAttribute('src');
  }
}
Quill.register(LocalVideoBlot);

// Разделитель: <hr>
class DividerBlot extends BlockEmbed {
  static blotName = 'divider';
  static tagName = 'hr';
  static create() {
    const node = super.create();
    node.setAttribute('role', 'separator');
    return node;
  }
}
Quill.register(DividerBlot);

// Все ссылки открывать в новой вкладке
const _linkCreate = Link.create;
Link.create = function (value) {
  const node = _linkCreate.call(this, value);
  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener');
  return node;
};
Quill.register(Link, true);

/* ================== utils ================== */
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');

function buildSrc(pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${ASSETS_BASE}${pathOrUrl}`;
}

// 'YYYY-MM-DDTHH:mm' для <input type="datetime-local" />
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

function stripTags(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html || '';
  const text = tmp.textContent || tmp.innerText || '';
  return text.replace(/\s+/g, ' ').trim();
}
const cut = (s, n = 140) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// красивая подпись для селекта матча
function matchLabel(m) {
  const left = m.team1?.title || `#${m.team1Id}`;
  const right = m.team2?.title || `#${m.team2Id}`;
  const dt = toDateTimeInputValue(m.date).replace('T', ' ') || '';
  return `${left} — ${right}${dt ? ` • ${dt}` : ''} (#${m.id})`;
}

/* ================== компонент ================== */
export default function NewsTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    id: null,
    title: '',
    description: '', // HTML
    date: '',
    leagueId: '',
    matchId: '',
    tournamentId: '',
    images: [],
    videos: [],
  });
  const isEdit = useMemo(() => form.id != null, [form.id]);

  // справочники
  const [leagues, setLeagues] = useState([]);
  const [matches, setMatches] = useState([]);
  const [tournaments, setTournaments] = useState([]);

  // Refs
  const imagesInputRef = useRef(null);
  const videosInputRef = useRef(null);
  const quillRef = useRef(null);
  const quillImageInputRef = useRef(null);
  const quillVideoInputRef = useRef(null);

  /* ===== загрузка новостей ===== */
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
      const res = await fetch(`${API_NEWS}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError('Не удалось загрузить новости');
    } finally {
      setLoading(false);
    }
  }

  /* ===== справочники ===== */
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

  /* первичная загрузка */
  useEffect(() => {
    load();
    loadLeagues();
    loadMatches(); // без фильтра — показываем все, пока лига не выбрана
    loadTournaments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // перезагрузка при поиске
  useEffect(() => {
    load();
  }, [q]);

  // при смене лиги — подгружаем матчи и сбрасываем matchId
  useEffect(() => {
    loadMatches(form.leagueId || '');
    setForm((s) => ({ ...s, matchId: '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.leagueId]);

  /* ===== форма ===== */
  function resetForm() {
    setForm({
      id: null,
      title: '',
      description: '',
      date: '',
      leagueId: '',
      matchId: '',
      tournamentId: '',
      images: [],
      videos: [],
    });
    setError('');
    if (imagesInputRef.current) imagesInputRef.current.value = '';
    if (videosInputRef.current) videosInputRef.current.value = '';
    if (quillImageInputRef.current) quillImageInputRef.current.value = '';
    if (quillVideoInputRef.current) quillVideoInputRef.current.value = '';
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(row) {
    setForm({
      id: row.id,
      title: row.title || '',
      description: row.description || '',
      date: toDateTimeInputValue(row.date),
      leagueId: row.leagueId ?? '',
      matchId: row.matchId ?? '',
      tournamentId: row.tournamentId ?? '',
      images: Array.isArray(row.images) ? row.images : [],
      videos: Array.isArray(row.videos) ? row.videos : [],
    });
    setError('');
    setShowForm(true);
    loadMatches(row.leagueId ?? '');
  }

  /* ===== upload ===== */
  async function uploadMany(fileList, endpoint, fieldName) {
    const files = Array.from(fileList || []);
    if (!files.length) return [];
    const fd = new FormData();
    files.forEach((f) => fd.append(fieldName, f)); // ВАЖНО: имя поля
    const res = await fetch(endpoint, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data?.error || data?.message || `Upload HTTP ${res.status}`
      );
    }
    const urls = Array.isArray(data.filePaths) ? data.filePaths : [];
    if (!urls.length) throw new Error('Сервер не вернул пути к файлам');
    return urls;
  }
  const uploadImages = (files) => uploadMany(files, API_UPLOAD_IMAGES, 'files');
  const uploadVideos = (files) =>
    uploadMany(files, API_UPLOAD_VIDEOS, 'videos');

  async function onUploadImages(e) {
    try {
      setLoading(true);
      setError('');
      const urls = await uploadImages(e.target.files);
      setForm((s) => ({ ...s, images: [...s.images, ...urls] }));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Не удалось загрузить изображения');
    } finally {
      setLoading(false);
      if (imagesInputRef.current) imagesInputRef.current.value = '';
    }
  }

  async function onUploadVideos(e) {
    try {
      setLoading(true);
      setError('');
      const urls = await uploadVideos(e.target.files);
      setForm((s) => ({ ...s, videos: [...s.videos, ...urls] }));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Не удалось загрузить видео');
    } finally {
      setLoading(false);
      if (videosInputRef.current) videosInputRef.current.value = '';
    }
  }

  function removeImage(url) {
    setForm((s) => ({ ...s, images: s.images.filter((u) => u !== url) }));
  }
  function removeVideo(url) {
    setForm((s) => ({ ...s, videos: s.videos.filter((u) => u !== url) }));
  }

  /* ====== Quill toolbar handlers ====== */
  const handleInsertDivider = () => {
    const quill = quillRef.current?.getEditor();
    if (!quill) return;
    const range = quill.getSelection(true);
    const index = range ? range.index : quill.getLength();
    quill.insertEmbed(index, 'divider', true, 'user');
    quill.setSelection(index + 1, 0, 'user');
  };

  const handleUndo = () => quillRef.current?.getEditor()?.history.undo();
  const handleRedo = () => quillRef.current?.getEditor()?.history.redo();

  const triggerImageSelect = () => quillImageInputRef.current?.click();
  const triggerVideoSelect = () => quillVideoInputRef.current?.click();

  const onQuillPickImage = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const [path] = await uploadImages([file]); // <-- изображения в /upload (files)
      const quill = quillRef.current?.getEditor();
      if (!quill) return;
      const range = quill.getSelection(true);
      const index = range ? range.index : quill.getLength();
      quill.insertEmbed(index, 'image', buildSrc(path), 'user');
      quill.setSelection(index + 1, 0, 'user');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Не удалось загрузить изображение');
    } finally {
      setLoading(false);
      if (quillImageInputRef.current) quillImageInputRef.current.value = '';
    }
  };

  const onQuillPickVideo = async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    try {
      setLoading(true);
      const [path] = await uploadVideos([file]); // <-- видео в /upload-videos (videos)
      const quill = quillRef.current?.getEditor();
      if (!quill) return;
      const range = quill.getSelection(true);
      const index = range ? range.index : quill.getLength();
      quill.insertEmbed(index, 'localVideo', buildSrc(path), 'user');
      quill.setSelection(index + 1, 0, 'user');
    } catch (err) {
      console.error(err);
      setError(err.message || 'Не удалось загрузить видео');
    } finally {
      setLoading(false);
      if (quillVideoInputRef.current) quillVideoInputRef.current.value = '';
    }
  };

  /* ====== save/remove ====== */
  async function save(e) {
    e.preventDefault();
    setError('');

    const payload = {
      title: form.title.trim(),
      description: form.description || '',
      date: form.date
        ? new Date(form.date).toISOString()
        : new Date().toISOString(),
      images: form.images,
      videos: form.videos,
      leagueId: form.leagueId ? Number(form.leagueId) : null,
      matchId: form.matchId ? Number(form.matchId) : null,
      tournamentId: form.tournamentId ? Number(form.tournamentId) : null,
    };

    try {
      const url = isEdit ? `${API_NEWS}/${form.id}` : API_NEWS;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const maybeText = await res.text();
      if (!res.ok) {
        console.error('Save error:', res.status, maybeText);
        setError('Не удалось сохранить новость.');
        return;
      }
      resetForm();
      setShowForm(false);
      await load();
    } catch (e2) {
      console.error(e2);
      setError('Не удалось сохранить новость');
    }
  }

  async function remove(id) {
    if (!window.confirm('Удалить новость?')) return;
    try {
      setError('');
      const res = await fetch(`${API_NEWS}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      console.error(e);
      setError('Не удалось удалить новость');
    }
  }

  /* ====== Quill config ====== */
  const quillModules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ header: [1, 2, 3, 4, 5, 6, false] }],
          [{ font: [] }, { size: [] }],
          ['bold', 'italic', 'underline', 'strike', 'blockquote', 'code-block'],
          [{ color: [] }, { background: [] }],
          [{ script: 'sub' }, { script: 'super' }],
          [
            { list: 'ordered' },
            { list: 'bullet' },
            { indent: '-1' },
            { indent: '+1' },
          ],
          [{ align: [] }],
          ['link', 'image', 'video', 'clean'],
          [{ divider: [] }],
          [{ undo: [] }, { redo: [] }],
          [{ videoLocal: [] }],
        ],
        handlers: {
          image: () => triggerImageSelect(),
          video: () => triggerVideoSelect(),
          divider: handleInsertDivider,
          undo: handleUndo,
          redo: handleRedo,
          videoLocal: () => triggerVideoSelect(),
        },
      },
      history: { delay: 500, maxStack: 200, userOnly: true },
      clipboard: { matchVisual: false },
    }),
    []
  );

  const quillFormats = [
    'header',
    'font',
    'size',
    'bold',
    'italic',
    'underline',
    'strike',
    'blockquote',
    'code-block',
    'color',
    'background',
    'script',
    'list',
    'bullet',
    'indent',
    'align',
    'link',
    'image',
    'localVideo',
    'divider',
  ];

  /* ====== render ====== */
  return (
    <div className="news">
      <header className="news__header">
        <h1 className="news__title">Новости</h1>

        <div className="news__search">
          <input
            className="input"
            placeholder="Поиск по заголовку/описанию…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn" onClick={load} disabled={loading}>
            Обновить
          </button>
        </div>

        <div className="news__actions">
          <button onClick={startCreate} disabled={loading}>
            Создать новость
          </button>
        </div>
      </header>

      {error && <div className="alert alert--error">{error}</div>}

      {showForm && (
        <section className="card">
          <form className="form" onSubmit={save}>
            <div className="form__row">
              <label className="field">
                <span className="field__label">Заголовок</span>
                <input
                  className="input"
                  value={form.title}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, title: e.target.value }))
                  }
                  required
                />
              </label>

              <label className="field">
                <span className="field__label">Дата</span>
                <input
                  className="input"
                  type="datetime-local"
                  value={form.date}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, date: e.target.value }))
                  }
                />
              </label>
            </div>

            <div className="form__row">
              <label className="field field--grow">
                <span className="field__label">Описание (HTML)</span>

                {/* скрытые инпуты для загрузки в редактор */}
                <input
                  type="file"
                  accept="image/*"
                  ref={quillImageInputRef}
                  className="hidden-input"
                  onChange={onQuillPickImage}
                />
                <input
                  type="file"
                  accept="video/*"
                  ref={quillVideoInputRef}
                  className="hidden-input"
                  onChange={onQuillPickVideo}
                />

                <ReactQuill
                  ref={quillRef}
                  theme="snow"
                  value={form.description}
                  onChange={(html) =>
                    setForm((s) => ({ ...s, description: html }))
                  }
                  modules={quillModules}
                  formats={quillFormats}
                />
              </label>
            </div>

            {/* ===== Привязки ===== */}
            <div className="form__row">
              {/* Лига */}
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

              {/* Матч (фильтр по выбранной лиге) */}
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

              {/* Турнир */}
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

            {/* ===== Медиа-вложения ===== */}
            <div className="form__row">
              {/* Изображения */}
              <label className="field field--grow">
                <span className="field__label">Изображения</span>
                <div className="upload">
                  <input
                    ref={imagesInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onUploadImages}
                    className="upload__input"
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => imagesInputRef.current?.click()}
                    disabled={loading}
                  >
                    Выбрать файлы
                  </button>
                  <span className="upload__hint">можно загрузить пачкой</span>
                </div>

                {form.images.length > 0 && (
                  <div className="thumbs">
                    {form.images.map((url) => (
                      <div className="thumb" key={url}>
                        <img src={buildSrc(url)} alt="" />
                        <button
                          type="button"
                          className="thumb__remove"
                          onClick={() => removeImage(url)}
                          title="Удалить"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </label>

              {/* Видео */}
              <label className="field field--grow">
                <span className="field__label">Видео</span>
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
                          controls
                          className="video-thumb"
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
          <div className="table__headNews">
            <div>ID</div>
            <div>Дата</div>
            <div>Заголовок и описание</div>
            <div>Привязки</div>
            <div>Медиа</div>
            <div>Действия</div>
          </div>
          <div className="table__body">
            {loading && <div className="table__row muted">Загрузка…</div>}
            {!loading && rows.length === 0 && (
              <div className="table__row muted">Нет новостей</div>
            )}
            {!loading &&
              rows.map((r) => {
                const preview = cut(stripTags(r.description || ''), 160);
                return (
                  <div className="table__rowNews" key={r.id}>
                    <div>#{r.id}</div>
                    <div>{dtLoc(r.date)}</div>
                    <div className="cell-strong">
                      {r.title}
                      <div className="cell-preview" title={preview}>
                        {preview || '—'}
                      </div>
                    </div>
                    <div>
                      <div className="muted">
                        Лига:{' '}
                        {r.league?.title
                          ? `${r.league.title} (#${r.leagueId})`
                          : r.leagueId
                          ? `#${r.leagueId}`
                          : '—'}
                      </div>
                      <div className="muted">
                        Матч: {r.matchId ? `#${r.matchId}` : '—'}
                      </div>
                      <div className="muted">
                        Турнир:{' '}
                        {r.tournament?.title
                          ? `${r.tournament.title} (#${r.tournamentId})`
                          : r.tournamentId
                          ? `#${r.tournamentId}`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="muted">
                        Фото: {Array.isArray(r.images) ? r.images.length : 0}
                      </div>
                      <div className="muted">
                        Видео: {Array.isArray(r.videos) ? r.videos.length : 0}
                      </div>
                    </div>
                    <div className="table__actions">
                      <button
                        className="btn btn--sm"
                        onClick={() => startEdit(r)}
                      >
                        Редактировать
                      </button>
                      <button
                        className="btn btn--sm "
                        onClick={() => remove(r.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </section>
    </div>
  );
}
