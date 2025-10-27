// src/admin/Stadiums/StadiumsTab.jsx
import React, { useEffect, useMemo, useState } from 'react';
import serverConfig from '../../../../serverConfig'; // <-- поправь путь при необходимости

const API = `${serverConfig}/stadiums`;

const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function StadiumsTab() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(20);

  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('ASC');

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', location: '' });

  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ name: '', location: '' });

  async function loadList() {
    try {
      setLoading(true);
      setErr('');

      const start = page * perPage;
      const end = start + perPage - 1;

      const params = new URLSearchParams({
        range: JSON.stringify([start, end]),
        sort: JSON.stringify([sortBy, sortDir]),
        filter: JSON.stringify(q ? { q } : {}),
      });

      const res = await fetch(`${API}?${params.toString()}`);
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      setRows(Array.isArray(data) ? data : []);

      // читаем Content-Range для total, если есть
      const cr = res.headers.get('Content-Range'); // e.g. "stadiums 0-19/137"
      const m = cr && /\/(\d+)$/.exec(cr);
      setTotal(m ? Number(m[1]) : Array.isArray(data) ? data.length : 0);
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Ошибка загрузки стадионов');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, sortBy, sortDir]);

  useEffect(() => {
    // При изменении поиска — сбрасываем на 1-ю страницу и перезагружаем
    setPage(0);
    const t = setTimeout(loadList, 300); // лёгкий debounce
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function toggleSort(field) {
    if (sortBy === field) {
      setSortDir((d) => (String(d).toUpperCase() === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(field);
      setSortDir('ASC');
    }
  }

  async function createItem(e) {
    e?.preventDefault?.();
    try {
      if (!form.name.trim()) throw new Error('Укажите название стадиона');
      setLoading(true);
      setErr('');
      const payload = {
        name: form.name.trim(),
        location: form.location.trim() ? form.location.trim() : null,
      };
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setForm({ name: '', location: '' });
      setShowCreate(false);
      await loadList();
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось создать стадион');
    } finally {
      setLoading(false);
    }
  }

  function startEdit(row) {
    setEditId(row.id);
    setEdit({ name: row.name || '', location: row.location || '' });
  }

  function cancelEdit() {
    setEditId(null);
    setEdit({ name: '', location: '' });
  }

  async function saveEdit() {
    if (!editId) return;
    try {
      if (!edit.name.trim()) throw new Error('Название обязательно');
      setLoading(true);
      setErr('');
      const payload = {
        name: edit.name,
        location: edit.location.trim() ? edit.location.trim() : null,
      };
      const res = await fetch(`${API}/${editId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      cancelEdit();
      await loadList();
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось сохранить изменения');
    } finally {
      setLoading(false);
    }
  }

  async function removeItem(id) {
    if (!window.confirm('Удалить стадион?')) return;
    try {
      setLoading(true);
      setErr('');
      const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      // если удалили последний элемент на странице — отскочим на предыдущую
      const isLastOnPage = rows.length === 1 && page > 0;
      if (isLastOnPage) setPage((p) => Math.max(0, p - 1));
      else await loadList();
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось удалить');
    } finally {
      setLoading(false);
    }
  }

  const pageCount = useMemo(
    () => Math.max(1, Math.ceil(total / perPage)),
    [total, perPage]
  );

  return (
    <div className="grid onecol">
      <div className="toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn--primary"
          onClick={() => setShowCreate((s) => !s)}
          disabled={loading}
        >
          {showCreate ? 'Закрыть форму' : 'Добавить стадион'}
        </button>
        <div className="spacer" />
        <input
          className="input"
          placeholder="Поиск по названию/локации…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 280 }}
        />
      </div>

      {showCreate && (
        <section className="card">
          <h3>Новый стадион</h3>
          {err && <div className="alert alert--error">{err}</div>}
          <form className="form" onSubmit={createItem}>
            <div className="form__row">
              <label className="field">
                <span className="field__label">Название *</span>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, name: e.target.value }))
                  }
                  placeholder="Напр., «Олимпийский»"
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">Локация</span>
                <input
                  className="input"
                  value={form.location}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, location: e.target.value }))
                  }
                  placeholder="Город, адрес (опц.)"
                />
              </label>
            </div>
            <div className="form__actions">
              <button
                className="btn btn--primary"
                type="submit"
                disabled={loading}
              >
                Сохранить
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setShowCreate(false);
                  setForm({ name: '', location: '' });
                }}
              >
                Отмена
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="card">
        <h3>Стадионы</h3>
        {err && <div className="alert alert--error">{err}</div>}
        <div className="table">
          <div className="table__headStad">
            <div
              style={{ width: 80, cursor: 'pointer' }}
              onClick={() => toggleSort('id')}
            >
              ID {sortBy === 'id' ? (sortDir === 'ASC' ? '▲' : '▼') : ''}
            </div>
            <div
              style={{ minWidth: 220, cursor: 'pointer' }}
              onClick={() => toggleSort('name')}
            >
              Название{' '}
              {sortBy === 'name' ? (sortDir === 'ASC' ? '▲' : '▼') : ''}
            </div>
            <div
              style={{ minWidth: 260, cursor: 'pointer' }}
              onClick={() => toggleSort('location')}
            >
              Локация{' '}
              {sortBy === 'location' ? (sortDir === 'ASC' ? '▲' : '▼') : ''}
            </div>
            <div style={{ width: 180 }}>Действия</div>
          </div>

          <div className="table__body">
            {loading && <div className="table__row">Загрузка…</div>}
            {!loading && rows.length === 0 && (
              <div className="table__row muted">Ничего не найдено</div>
            )}

            {rows.map((r) => {
              const isEdit = editId === r.id;
              return (
                <div key={r.id} className="table__rowStad">
                  <div style={{ width: 80 }}>#{r.id}</div>
                  <div style={{ minWidth: 220 }}>
                    {!isEdit ? (
                      r.name || '—'
                    ) : (
                      <input
                        className="input input--sm"
                        value={edit.name}
                        onChange={(e) =>
                          setEdit((s) => ({ ...s, name: e.target.value }))
                        }
                        placeholder="Название"
                      />
                    )}
                  </div>
                  <div style={{ minWidth: 260 }}>
                    {!isEdit ? (
                      r.location || '—'
                    ) : (
                      <input
                        className="input input--sm"
                        value={edit.location}
                        onChange={(e) =>
                          setEdit((s) => ({ ...s, location: e.target.value }))
                        }
                        placeholder="Локация"
                      />
                    )}
                  </div>
                  <div
                    className="table__actions"
                    style={{ width: 180, gap: 8 }}
                  >
                    {!isEdit ? (
                      <>
                        <button
                          className="btn btn--xs"
                          onClick={() => startEdit(r)}
                        >
                          Изм.
                        </button>
                        <button
                          className="btn btn--xs "
                          onClick={() => removeItem(r.id)}
                        >
                          Удалить
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn--xs btn--primary"
                          onClick={saveEdit}
                          disabled={loading || !edit.name.trim()}
                        >
                          Сохранить
                        </button>
                        <button
                          className="btn btn--xs btn--ghost"
                          onClick={cancelEdit}
                        >
                          Отмена
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Пагинация */}
        <div
          className="toolbar"
          style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}
        >
          <span className="muted">
            Всего: <b>{total}</b>
          </span>
          <select
            className="input"
            value={perPage}
            onChange={(e) => {
              setPerPage(toInt(e.target.value) || 20);
              setPage(0);
            }}
            style={{ width: 100 }}
          >
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>
                {n} / стр.
              </option>
            ))}
          </select>
          <button
            className="btn btn--ghost"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            ←
          </button>
          <span className="muted">
            {page + 1} / {pageCount}
          </span>
          <button
            className="btn btn--ghost"
            disabled={page + 1 >= pageCount}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            →
          </button>
        </div>
      </section>
    </div>
  );
}
