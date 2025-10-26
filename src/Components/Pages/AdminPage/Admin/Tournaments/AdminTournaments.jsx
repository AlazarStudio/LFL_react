import React, { useEffect, useMemo, useRef, useState } from 'react';
import serverConfig from '../../../../../serverConfig';
import uploadsConfig from '../../../../../uploadsConfig';
import { Link } from 'react-router-dom';

const API = `${serverConfig}/tournaments`;
const UPLOAD_API = `${serverConfig}/upload`;
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');

function buildSrc(pathOrUrl) {
  if (!pathOrUrl) return '';
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${ASSETS_BASE}${pathOrUrl}`;
}
function toDateInput(val) {
  if (!val) return '';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export default function AdminTournaments() {
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
    halfMinutes: 45,
    halves: 2,
    startDate: '',
    registrationDeadline: '',
    images: [],
  });
  const isEdit = useMemo(() => form.id != null, [form.id]);
  const imagesRef = useRef(null);

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
      const data = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError('Не удалось загрузить турниры');
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
      halfMinutes: 45,
      halves: 2,
      startDate: '',
      registrationDeadline: '',
      images: [],
    });
    setError('');
    if (imagesRef.current) imagesRef.current.value = '';
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
      halfMinutes: row.halfMinutes ?? 45,
      halves: row.halves ?? 2,
      startDate: toDateInput(row.startDate),
      registrationDeadline: toDateInput(row.registrationDeadline),
      images: Array.isArray(row.images) ? row.images : [],
    });
    setError('');
    setShowForm(true);
  }

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
    return urls;
  }
  async function onUploadImages(e) {
    try {
      setLoading(true);
      setError('');
      const urls = await uploadMany(e.target.files);
      setForm((s) => ({ ...s, images: [...s.images, ...urls] }));
    } catch (err) {
      setError(err.message || 'Не удалось загрузить изображения');
    } finally {
      setLoading(false);
      if (imagesRef.current) imagesRef.current.value = '';
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
      halfMinutes: Number(form.halfMinutes) || 45,
      halves: Number(form.halves) || 2,
      startDate: form.startDate || null,
      registrationDeadline: form.registrationDeadline || null,
      images: form.images,
    };
    try {
      const url = isEdit ? `${API}/${form.id}` : API;
      const method = isEdit ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const txt = await res.text();
      if (!res.ok) {
        console.error('Save error:', res.status, txt);
        setError('Не удалось сохранить турнир.');
        return;
      }
      resetForm();
      setShowForm(false);
      await load();
    } catch {
      setError('Не удалось сохранить турнир');
    }
  }

  async function remove(id) {
    if (!window.confirm('Удалить турнир?')) return;
    try {
      setError('');
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch {
      setError('Не удалось удалить турнир');
    }
  }

  return (
    <div className="leagues">
      <header className="leagues__header">
        <h1 className="leagues__title">Турниры</h1>
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
            Создать турнир
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
                  required
                  onChange={(e) =>
                    setForm((s) => ({ ...s, title: e.target.value }))
                  }
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
                    ref={imagesRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onUploadImages}
                    className="upload__input"
                  />
                  <button
                    type="button"
                    className="btn"
                    onClick={() => imagesRef.current?.click()}
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
                className="btn "
                type="submit"
                disabled={loading}
              >
                {isEdit ? 'Сохранить' : 'Добавить'}
              </button>
              <button
                type="button"
                className="btn"
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
                  <div>{toDateInput(r.startDate) || '—'}</div>
                  <div className="table__actions">
                    <Link
                      className="btn"
                      to={`/admin/tournaments/${r.id}`}
                    >
                      Открыть
                    </Link>
                    <button
                      className="btn"
                      onClick={() => startEdit(r)}
                    >
                      Редактировать
                    </button>
                    <button
                      className="btn"
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
