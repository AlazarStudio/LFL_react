import React, { useEffect, useState } from 'react';
import serverConfig from '../../../../../../serverConfig';
// import { toast } from '../../common/toast';

const STAGES = [
  { value: 'ROUND_OF_32', label: '1/16 финала' },
  { value: 'ROUND_OF_16', label: '1/8 финала' },
  { value: 'QUARTERFINAL', label: '1/4 финала' },
  { value: 'SEMIFINAL', label: '1/2 финала' },
  { value: 'FINAL', label: 'Финал' },
  { value: 'THIRD_PLACE', label: 'Матч за 3-е' },
];

export default function TournamentRoundsTab({ tournamentId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    stage: 'FINAL',
    name: '',
    number: '',
    date: '',
  });
  const [editId, setEditId] = useState(null);

  async function load() {
    const res = await fetch(
      `${serverConfig}/tournaments/${tournamentId}/rounds`
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Ошибка загрузки');
    setRows(Array.isArray(data) ? data : []);
  }
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await load();
      } catch (e) {
        setErr('Ошибка');
      } finally {
        setLoading(false);
      }
    })();
  }, [tournamentId]);

  async function create(e) {
    e.preventDefault();
    setErr('');
    try {
      const res = await fetch(
        `${serverConfig}/tournaments/${tournamentId}/rounds`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stage: form.stage,
            name: form.name || null,
            number: form.number ? Number(form.number) : null,
            date: form.date || null,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось создать раунд');
    //   toast('Раунд создан', 'success');
      setForm({ stage: 'FINAL', name: '', number: '', date: '' });
      await load();
    } catch (e) {
      setErr(e.message);
    //   toast(e.message, 'error');
    }
  }

  async function save(row) {
    try {
      const res = await fetch(`${serverConfig}/tournament-rounds/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage: row.stage,
          name: row.name || null,
          number: row.number ?? null,
          date: row.date || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось сохранить');
    //   toast('Сохранено', 'success');
      setEditId(null);
      await load();
    } catch (e) {
    //   toast(e.message, 'error');
    }
  }

  async function remove(id) {
    if (!window.confirm('Удалить раунд?')) return;
    try {
      const res = await fetch(`${serverConfig}/tournament-rounds/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Не удалось удалить');
    //   toast('Удалено', 'success');
      await load();
    } catch (e) {
    //   toast(e.message, 'error');
    }
  }

  return (
    <div className="grid onecol">
      <section className="card">
        <h3>Создать раунд</h3>
        {err && <div className="alert alert--error">{err}</div>}
        <form className="form" onSubmit={create}>
          <div className="form__row">
            <label className="field">
              <span className="field__label">Стадия</span>
              <select
                className="input"
                value={form.stage}
                onChange={(e) =>
                  setForm((s) => ({ ...s, stage: e.target.value }))
                }
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Название</span>
              <input
                className="input"
                value={form.name}
                onChange={(e) =>
                  setForm((s) => ({ ...s, name: e.target.value }))
                }
                placeholder="например: 1/2 финала"
              />
            </label>
            <label className="field">
              <span className="field__label">Номер</span>
              <input
                className="input"
                type="number"
                value={form.number}
                onChange={(e) =>
                  setForm((s) => ({ ...s, number: e.target.value }))
                }
              />
            </label>
            <label className="field">
              <span className="field__label">Дата</span>
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={(e) =>
                  setForm((s) => ({ ...s, date: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="form__actions">
            <button className="btn btn--primary" type="submit">
              Добавить
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h3>Раунды</h3>
        <div className="table">
          <div className="table__head">
            <div>ID</div>
            <div>Стадия</div>
            <div>Название</div>
            <div>№</div>
            <div>Дата</div>
            <div>Действия</div>
          </div>
          <div className="table__body">
            {rows.length === 0 && <div className="table__row muted">Пусто</div>}
            {rows.map((r) => (
              <div className="table__row" key={r.id}>
                <div>#{r.id}</div>
                <div>
                  {editId === r.id ? (
                    <select
                      className="input"
                      value={r.stage}
                      onChange={(e) =>
                        setRows((s) =>
                          s.map((x) =>
                            x.id === r.id ? { ...x, stage: e.target.value } : x
                          )
                        )
                      }
                    >
                      {STAGES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    STAGES.find((x) => x.value === r.stage)?.label || r.stage
                  )}
                </div>
                <div>
                  {editId === r.id ? (
                    <input
                      className="input"
                      value={r.name || ''}
                      onChange={(e) =>
                        setRows((s) =>
                          s.map((x) =>
                            x.id === r.id ? { ...x, name: e.target.value } : x
                          )
                        )
                      }
                    />
                  ) : (
                    r.name || '—'
                  )}
                </div>
                <div>
                  {editId === r.id ? (
                    <input
                      className="input"
                      type="number"
                      value={r.number ?? ''}
                      onChange={(e) =>
                        setRows((s) =>
                          s.map((x) =>
                            x.id === r.id
                              ? {
                                  ...x,
                                  number:
                                    e.target.value === ''
                                      ? null
                                      : Number(e.target.value),
                                }
                              : x
                          )
                        )
                      }
                    />
                  ) : (
                    r.number ?? '—'
                  )}
                </div>
                <div>
                  {editId === r.id ? (
                    <input
                      className="input"
                      type="date"
                      value={
                        r.date
                          ? new Date(r.date).toISOString().slice(0, 10)
                          : ''
                      }
                      onChange={(e) =>
                        setRows((s) =>
                          s.map((x) =>
                            x.id === r.id
                              ? { ...x, date: e.target.value || null }
                              : x
                          )
                        )
                      }
                    />
                  ) : r.date ? (
                    new Date(r.date).toLocaleDateString()
                  ) : (
                    '—'
                  )}
                </div>
                <div className="table__actions">
                  {editId === r.id ? (
                    <>
                      <button className="btn btn--sm" onClick={() => save(r)}>
                        Сохранить
                      </button>
                      <button
                        className="btn btn--sm btn--ghost"
                        onClick={() => setEditId(null)}
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn--sm"
                        onClick={() => setEditId(r.id)}
                      >
                        Редактировать
                      </button>
                      <button
                        className="btn"
                        onClick={() => remove(r.id)}
                      >
                        Удалить
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
