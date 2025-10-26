import React, { useEffect, useMemo, useRef, useState } from 'react';
import serverConfig from '../../../../serverConfig'; // например: 'http://localhost:5000/api'
import uploadsConfig from '../../../../uploadsConfig'; // например: 'http://localhost:5000'
import './Teams.css';
import { useNavigate } from 'react-router-dom';

const API = `${serverConfig}/teams`;
// загрузка файлов идёт по /api/upload → берём базу serverConfig
const UPLOAD_API = `${serverConfig}/upload`;

// базовый хост для статики (убеждаемся, что там нет /api)
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');

// собрать корректный src для изображения
function buildSrc(pathOrUrl) {
  if (!pathOrUrl) return '';
  // уже полный URL?
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  // относительный путь типа /uploads/....
  return `${ASSETS_BASE}${pathOrUrl}`;
}

export default function AdminTeams() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  const navigate = useNavigate();

  const [form, setForm] = useState({
    id: null,
    title: '',
    city: '',
    logo: [],
    images: [],
  });
  const isEdit = useMemo(() => form.id != null, [form.id]);

  const logoInputRef = useRef(null);
  const imagesInputRef = useRef(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        range: JSON.stringify([0, 199]),
        sort: JSON.stringify(['id', 'ASC']),
        filter: JSON.stringify(q ? { q } : {}),
      });
      const res = await fetch(`${API}?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTeams(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError('Не удалось загрузить список команд');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function resetForm() {
    setForm({ id: null, title: '', city: '', logo: [], images: [] });
    setError('');
    if (logoInputRef.current) logoInputRef.current.value = '';
    if (imagesInputRef.current) imagesInputRef.current.value = '';
  }

  function startEdit(t) {
    setForm({
      id: t.id,
      title: t.title || '',
      city: t.city || '',
      logo: Array.isArray(t.logo) ? t.logo : [],
      images: Array.isArray(t.images) ? t.images : [],
    });
    setError('');
  }

  // загрузка пачкой — бэкенд ждёт ключ 'files' на /api/upload
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
    // сюда приходят строки типа '/uploads/xxx.jpg' — это правильно
    return urls;
  }

  async function onUploadLogo(e) {
    try {
      setLoading(true);
      setError('');
      const urls = await uploadMany(e.target.files);
      setForm((s) => ({ ...s, logo: [...s.logo, ...urls] }));
    } catch (err) {
      console.error(err);
      setError(err.message || 'Не удалось загрузить логотипы');
    } finally {
      setLoading(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
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

  function removeFrom(field, url) {
    setForm((s) => ({ ...s, [field]: s[field].filter((u) => u !== url) }));
  }

  async function save(e) {
    e.preventDefault();
    setError('');
    const payload = {
      title: form.title.trim(),
      city: form.city.trim(),
      logo: form.logo, // сюда уже положены '/uploads/...' после upload
      images: form.images, // сюда уже положены '/uploads/...' после upload
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
        setError('Не удалось сохранить команду.');
        return;
      }
      resetForm();
      await load();
    } catch (e2) {
      console.error(e2);
      setError('Не удалось сохранить команду');
    }
  }

  async function remove(id) {
    if (!window.confirm('Удалить команду?')) return;
    try {
      setError('');
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e) {
      console.error(e);
      setError('Не удалось удалить команду');
    }
  }

  return (
    <div className="teams">
      <header className="teams__header">
        <h1 className="teams__title">Команды</h1>
        <div className="teams__search">
          <input
            className="input"
            placeholder="Поиск по названию/городу…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="btn" onClick={load} disabled={loading}>
            Обновить
          </button>
        </div>
      </header>

      {error && <div className="alert alert--error">{error}</div>}

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
              <span className="field__label">Логотипы</span>
              <div className="upload">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={onUploadLogo}
                  className="upload__input"
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={loading}
                >
                  Выбрать файлы
                </button>
                <span className="upload__hint">png/jpg, можно несколько</span>
              </div>
              {form.logo.length > 0 && (
                <div className="thumbs">
                  {form.logo.map((url) => (
                    <div className="thumb" key={url}>
                      <img src={buildSrc(url)} alt="" />
                      <button
                        type="button"
                        className="thumb__remove"
                        onClick={() => removeFrom('logo', url)}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </label>

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
                        onClick={() => removeFrom('images', url)}
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
            {isEdit && (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={resetForm}
              >
                Отмена
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="card">
        <div className="table">
          <div className="table__head">
            <div>ID</div>
            <div>Название</div>
            <div>Город</div>
            {/* <div>Лого</div> */}
            <div>Действия</div>
          </div>
          <div className="table__body">
            {loading && <div className="table__row muted">Загрузка…</div>}
            {!loading && teams.length === 0 && (
              <div className="table__row muted">Нет данных</div>
            )}
            {!loading &&
              teams.map((t) => (
                <div className="table__row" key={t.id}>
                  <div>#{t.id}</div>
                  <div className="cell-strong">{t.title}</div>
                  <div>{t.city}</div>
                  {/* <div>
                    {t.logo?.length ? (
                      <img
                        src={buildSrc(t.logo[0])}
                        alt=""
                        style={{
                          maxWidth: 64,
                          maxHeight: 64,
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      '—'
                    )}
                  </div> */}
                  <div className="table__actions">
                    <button
                      className="btn btn--sm"
                      onClick={() => navigate(`/admin/teams/${t.id}`)}
                    >
                      Открыть
                    </button>
                    <button
                      className="btn btn--sm"
                      onClick={() => startEdit(t)}
                    >
                      Редактировать
                    </button>
                    <button
                      className="btn btn--sm "
                      onClick={() => remove(t.id)}
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
