import React, { useEffect, useMemo, useRef, useState } from 'react';
import serverConfig from '../../../../serverConfig'; // напр. 'http://localhost:5000/api'
import uploadsConfig from '../../../../uploadsConfig'; // напр. 'http://localhost:5000'
import { Link } from 'react-router-dom';
import './Leagues.css';

const API = `${serverConfig}/leagues`;
const UPLOAD_API = `${serverConfig}/upload`; // загрузка файлов идёт через /api/upload

// на показ статики используем базу без /api
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');

function buildSrc(pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${ASSETS_BASE}${pathOrUrl}`;
}

function toDateInputValue(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const FORMAT_OPTIONS = [
  'F5x5',
  'F6x6',
  'F7x7',
  'F8x8',
  'F9x9',
  'F10x10',
  'F11x11',
];

export default function AdminLeagues() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    id: null,
    title: '',
    season: '',
    city: '',
    format: 'F11x11',
    halfMinutes: 45,
    halves: 2,
    startDate: '',
    registrationDeadline: '',
    images: [],
  });
  const isEdit = useMemo(() => form.id != null, [form.id]);

  const imagesInputRef = useRef(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        range: JSON.stringify([0, 199]),
        sort: JSON.stringify(['startDate', 'DESC']),
        filter: JSON.stringify(q ? { q } : {}),
      });
      const res = await fetch(`${API}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError('Не удалось загрузить лиги');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [q]);

  function resetForm() {
    setForm({
      id: null,
      title: '',
      season: '',
      city: '',
      format: 'F11x11',
      halfMinutes: 45,
      halves: 2,
      startDate: '',
      registrationDeadline: '',
      images: [],
    });
    setError('');
    if (imagesInputRef.current) imagesInputRef.current.value = '';
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(row) {
    setForm({
      id: row.id,
      title: row.title || '',
      season: row.season || '',
      city: row.city || '',
      format: row.format || 'F11x11',
      halfMinutes: row.halfMinutes ?? 45,
      halves: row.halves ?? 2,
      startDate: toDateInputValue(row.startDate),
      registrationDeadline: toDateInputValue(row.registrationDeadline),
      images: Array.isArray(row.images) ? row.images : [],
    });
    setError('');
    setShowForm(true);
  }

  // загрузка картинок пачкой (ключ 'files')
  async function uploadMany(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return [];
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    const res = await fetch(UPLOAD_API, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        data?.error || data?.message || `Upload HTTP ${res.status}`
      );
    }
    const urls = Array.isArray(data.filePaths) ? data.filePaths : [];
    if (!urls.length) throw new Error('Сервер не вернул пути к файлам');
    return urls; // типа ['/uploads/xxx.jpg']
  }

  async function onUploadImages(e) {
    try {
      setLoading(true);
      setError('');
      const urls = await uploadMany(e.target.files);
      setForm((s) => ({ ...s, images: [...s.images, ...urls] }));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Не удалось загрузить изображения');
    } finally {
      setLoading(false);
      if (imagesInputRef.current) imagesInputRef.current.value = '';
    }
  }

  function removeImage(url) {
    setForm((s) => ({ ...s, images: s.images.filter((u) => u !== url) }));
  }

  async function save(e) {
    e.preventDefault();
    setError('');

    const payload = {
      title: form.title.trim(),
      season: form.season.trim() || null,
      city: form.city.trim() || null,
      format: form.format || 'F11x11',
      halfMinutes: Number(form.halfMinutes) || 45,
      halves: Number(form.halves) || 2,
      startDate: form.startDate || null, // 'YYYY-MM-DD'
      registrationDeadline: form.registrationDeadline || null,
      images: form.images,
    };

    try {
      const url = isEdit ? `${API}/${form.id}` : API;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const maybeText = await res.text();
      if (!res.ok) {
        console.error('Save error:', res.status, maybeText);
        setError('Не удалось сохранить лигу.');
        return;
      }
      resetForm();
      setShowForm(false); // закрыть форму после успешного сохранения
      await load();
    } catch (e2) {
      console.error(e2);
      setError('Не удалось сохранить лигу');
    }
  }

  async function remove(id) {
    if (!window.confirm('Удалить лигу?')) return;
    try {
      setError('');
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      console.error(e);
      setError('Не удалось удалить лигу');
    }
  }

  return (
    <div className="leagues">
      <header className="leagues__header">
        <h1 className="leagues__title">Лиги</h1>

        <div className="leagues__search">
          <input
            className="input"
            placeholder="Поиск по названию/городу/сезону…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn" onClick={load} disabled={loading}>
            Обновить
          </button>
        </div>

        <div className="leagues__actions">
          <button onClick={startCreate} disabled={loading}>
            Создать лигу
          </button>
        </div>
      </header>

      {error && <div className="alert alert--error">{error}</div>}

      {showForm && (
        <section className="card">
          <form className="form" onSubmit={save}>
            <div className="form__row">
              <label className="field">
                <span className="field__label">Название</span>
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
                <span className="field__label">Сезон</span>
                <input
                  className="input"
                  value={form.season}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, season: e.target.value }))
                  }
                  placeholder="например: 2024/25"
                />
              </label>

              <label className="field">
                <span className="field__label">Город</span>
                <input
                  className="input"
                  value={form.city}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, city: e.target.value }))
                  }
                />
              </label>
            </div>

            <div className="form__row">
              <label className="field">
                <span className="field__label">Формат</span>
                <select
                  className="input"
                  value={form.format}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, format: e.target.value }))
                  }
                >
                  {FORMAT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt.replace('F', '').replace('x', '×')}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span className="field__label">Минут в тайме</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.halfMinutes}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, halfMinutes: e.target.value }))
                  }
                />
              </label>

              <label className="field">
                <span className="field__label">Таймов</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={form.halves}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, halves: e.target.value }))
                  }
                />
              </label>
            </div>

            <div className="form__row">
              <label className="field">
                <span className="field__label">Дата старта</span>
                <input
                  className="input"
                  type="date"
                  value={form.startDate}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, startDate: e.target.value }))
                  }
                />
              </label>

              <label className="field">
                <span className="field__label">Дедлайн регистрации</span>
                <input
                  className="input"
                  type="date"
                  value={form.registrationDeadline}
                  onChange={(e) =>
                    setForm((s) => ({
                      ...s,
                      registrationDeadline: e.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="form__row">
              <label className="field">
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
            <div>ID</div>
            <div>Название</div>
            <div>Сезон</div>
            <div>Город</div>
            <div>Формат</div>
            <div>Старт</div>
            <div>Действия</div>
          </div>
          <div className="table__body">
            {loading && <div className="table__row muted">Загрузка…</div>}
            {!loading && rows.length === 0 && (
              <div className="table__row muted">Нет данных</div>
            )}
            {!loading &&
              rows.map((r) => (
                <div className="table__row" key={r.id}>
                  <div>#{r.id}</div>
                  <div className="cell-strong">{r.title}</div>
                  <div>{r.season || '—'}</div>
                  <div>{r.city || '—'}</div>
                  <div>
                    {(r.format || '').replace('F', '').replace('x', '×') || '—'}
                  </div>
                  <div>{toDateInputValue(r.startDate) || '—'}</div>
                  <div className="table__actions">
                    <Link className="btn btn--sm" to={`/admin/leagues/${r.id}`}>
                      Открыть
                    </Link>
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
              ))}
          </div>
        </div>
      </section>
    </div>
  );
}
