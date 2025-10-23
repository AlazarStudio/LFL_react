// src/admin/Referees/AdminReferees.jsx
import React, { useEffect, useMemo, useState } from 'react';
import serverConfig from '../../../../serverConfig';
import './AdminReferees.css';

const API_REFS = `${serverConfig}/referees`;

const fmtDT = (s) => {
  try {
    return new Date(s).toLocaleString();
  } catch {
    return s || '';
  }
};

/* ===================== Модалка со статистикой судьи ===================== */
function RefereeStatsModal({ referee, onClose }) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [stats, setStats] = useState(null);
  const [matches, setMatches] = useState([]);
  const [tMatches, setTMatches] = useState([]);

  async function loadStats() {
    const res = await fetch(`${API_REFS}/${referee.id}/stats`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setStats(data);
  }
  async function loadMatches() {
    const range = JSON.stringify([0, 19]);
    const [r1, r2] = await Promise.all([
      fetch(
        `${API_REFS}/${referee.id}/matches?range=${encodeURIComponent(range)}`
      ),
      fetch(
        `${API_REFS}/${
          referee.id
        }/tournament-matches?range=${encodeURIComponent(range)}`
      ),
    ]);
    const [d1, d2] = await Promise.all([r1.json(), r2.json()]);
    if (!r1.ok) throw new Error(d1?.error || `HTTP ${r1.status}`);
    if (!r2.ok) throw new Error(d2?.error || `HTTP ${r2.status}`);
    setMatches(Array.isArray(d1) ? d1 : []);
    setTMatches(Array.isArray(d2) ? d2 : []);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await Promise.all([loadStats(), loadMatches()]);
      } catch (e) {
        console.error(e);
        setErr(e.message || 'Ошибка загрузки статистики');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referee.id]);

  return (
    <div className="modal refstats-modal" onClick={onClose}>
      <div className="modal__backdrop" />
      <div
        className="modal__dialog refstats-modal__dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h3 className="modal__title">Судья: {referee.name}</h3>
          <button className="btn btn--ghost" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal__body">
          {err && <div className="alert alert--error">{err}</div>}
          {loading && <div className="alert">Загрузка…</div>}

          {stats && (
            <div className="grid2">
              <section className="card">
                <h4>Итоги</h4>
                <div className="ref-kpis">
                  <div className="kpi">
                    <div className="kpi__label">Лиг. матчи</div>
                    <div className="kpi__value">
                      {stats.totals?.leagueMatches ?? 0}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi__label">Турн. матчи</div>
                    <div className="kpi__value">
                      {stats.totals?.tournamentMatches ?? 0}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi__label">Жёлтые</div>
                    <div className="kpi__value">
                      {stats.cards?.total?.yellow ?? 0}
                    </div>
                  </div>
                  <div className="kpi">
                    <div className="kpi__label">Красные</div>
                    <div className="kpi__value">
                      {stats.cards?.total?.red ?? 0}
                    </div>
                  </div>
                </div>

                <h5 style={{ marginTop: 12 }}>По лигам</h5>
                <div className="table">
                  <div className="table__head">
                    <div>Лига ID</div>
                    <div>Матчей</div>
                    <div>По ролям</div>
                  </div>
                  <div className="table__body">
                    {(stats.leagues || []).length === 0 && (
                      <div className="table__row muted">Нет данных</div>
                    )}
                    {(stats.leagues || []).map((r) => (
                      <div className="table__row" key={r.leagueId}>
                        <div>#{r.leagueId}</div>
                        <div>{r.total}</div>
                        <div className="muted">
                          {Object.entries(r.byRole || {})
                            .map(([role, cnt]) => `${role}: ${cnt}`)
                            .join(', ') || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <h5 style={{ marginTop: 12 }}>По турнирам</h5>
                <div className="table">
                  <div className="table__head">
                    <div>Турнир ID</div>
                    <div>Матчей</div>
                    <div>По ролям</div>
                  </div>
                  <div className="table__body">
                    {(stats.tournaments || []).length === 0 && (
                      <div className="table__row muted">Нет данных</div>
                    )}
                    {(stats.tournaments || []).map((r) => (
                      <div className="table__row" key={r.tournamentId}>
                        <div>#{r.tournamentId}</div>
                        <div>{r.total}</div>
                        <div className="muted">
                          {Object.entries(r.byRole || {})
                            .map(([role, cnt]) => `${role}: ${cnt}`)
                            .join(', ') || '—'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="card">
                <h4>Недавние матчи</h4>
                <h5>Лиговые</h5>
                <div className="table">
                  <div className="table__head">
                    <div>ID</div>
                    <div>Дата</div>
                    <div>Лига</div>
                    <div>Матч</div>
                  </div>
                  <div className="table__body">
                    {matches.length === 0 && (
                      <div className="table__row muted">Пусто</div>
                    )}
                    {matches.map((m) => (
                      <div
                        className="table__row"
                        key={m.match?.id || m.matchId}
                      >
                        <div>#{m.match?.id || m.matchId}</div>
                        <div>{fmtDT(m.match?.date)}</div>
                        <div>
                          {m.match?.league?.title ||
                            `#${m.match?.league?.id || '—'}`}
                        </div>
                        <div>
                          {m.match?.team1?.title ||
                            `#${m.match?.team1?.id || '—'}`}{' '}
                          —{' '}
                          {m.match?.team2?.title ||
                            `#${m.match?.team2?.id || '—'}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <h5 style={{ marginTop: 12 }}>Турнирные</h5>
                <div className="table">
                  <div className="table__head">
                    <div>ID</div>
                    <div>Дата</div>
                    <div>Турнир</div>
                    <div>Матч</div>
                  </div>
                  <div className="table__body">
                    {tMatches.length === 0 && (
                      <div className="table__row muted">Пусто</div>
                    )}
                    {tMatches.map((m) => (
                      <div
                        className="table__row"
                        key={m.match?.id || m.matchId}
                      >
                        <div>#{m.match?.id || m.matchId}</div>
                        <div>{fmtDT(m.match?.date)}</div>
                        <div>
                          {m.match?.tournament?.title ||
                            `#${m.match?.tournament?.id || '—'}`}
                        </div>
                        <div>
                          {m.match?.team1TT?.team?.title ||
                            `#${m.match?.team1TT?.team?.id || '—'}`}{' '}
                          —{' '}
                          {m.match?.team2TT?.team?.title ||
                            `#${m.match?.team2TT?.team?.id || '—'}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        <div className="modal__footer">
          <button className="btn" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}

/* ===================== Основная страница «Судьи» ===================== */
export default function AdminReferees() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // пагинация/сортировка/фильтры
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(20);
  const [sort, setSort] = useState(['name', 'ASC']);
  const [q, setQ] = useState('');
  const [hasMatches, setHasMatches] = useState(false);
  const [role, setRole] = useState('');
  const [leagueId, setLeagueId] = useState('');

  // формы
  const [newName, setNewName] = useState('');
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');

  // модалка стат
  const [viewRef, setViewRef] = useState(null);

  const range = useMemo(() => {
    const start = page * perPage;
    const end = start + perPage - 1;
    return [start, end];
  }, [page, perPage]);

  async function loadList() {
    const params = new URLSearchParams({
      range: JSON.stringify(range),
      sort: JSON.stringify(sort),
      filter: JSON.stringify({
        ...(q ? { q } : {}),
        ...(hasMatches ? { hasMatches: true } : {}),
        ...(leagueId ? { leagueId: Number(leagueId) } : {}),
        ...(role ? { role } : {}),
      }),
    });
    const res = await fetch(`${API_REFS}?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setRows(Array.isArray(data) ? data : []);
    const cr = res.headers.get('Content-Range'); // "referees 0-19/123"
    const totalFromHeader = Number((cr || '').split('/')[1]) || data.length;
    setTotal(totalFromHeader);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await loadList();
      } catch (e) {
        console.error(e);
        setErr(e.message || 'Ошибка загрузки судей');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, perPage, sort[0], sort[1], q, hasMatches, role, leagueId]);

  async function createReferee(e) {
    e.preventDefault();
    try {
      setLoading(true);
      setErr('');
      if (!newName.trim()) throw new Error('Введите имя');
      const res = await fetch(API_REFS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setNewName('');
      setPage(0);
      await loadList();
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось создать судью');
    } finally {
      setLoading(false);
    }
  }

  async function saveEdit(id) {
    try {
      setLoading(true);
      setErr('');
      const res = await fetch(`${API_REFS}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setEditId(null);
      setEditName('');
      await loadList();
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось обновить');
    } finally {
      setLoading(false);
    }
  }

  async function remove(id) {
    if (!window.confirm('Удалить судью?')) return;
    try {
      setLoading(true);
      setErr('');
      const res = await fetch(`${API_REFS}/${id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadList();
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось удалить');
    } finally {
      setLoading(false);
    }
  }

  const toggleSort = (field) => {
    setSort(([f, dir]) =>
      f === field ? [field, dir === 'ASC' ? 'DESC' : 'ASC'] : [field, 'ASC']
    );
  };

  const pagesTotal = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="grid onecol">
      <section className="card">
        <h3>Судьи</h3>
        {err && <div className="alert alert--error">{err}</div>}

        {/* Фильтры */}
        <div className="filters">
          <input
            className="input"
            placeholder="Поиск по имени…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
          <label className="field field--checkbox">
            <input
              type="checkbox"
              checked={hasMatches}
              onChange={(e) => {
                setHasMatches(e.target.checked);
                setPage(0);
              }}
            />
            <span>Только с матчами</span>
          </label>
          <input
            className="input"
            type="number"
            min={1}
            placeholder="leagueId"
            value={leagueId}
            onChange={(e) => {
              setLeagueId(e.target.value);
              setPage(0);
            }}
            style={{ width: 120 }}
          />
          <input
            className="input"
            placeholder="Роль (например MAIN)"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(0);
            }}
            style={{ width: 180 }}
          />
          <div className="grow" />
          <label className="field">
            <span className="field__label">На стр.</span>
            <select
              className="input"
              value={perPage}
              onChange={(e) => {
                setPerPage(Number(e.target.value));
                setPage(0);
              }}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Таблица */}
        <div className="table">
          <div className="table__head">
            <button className="thbtn" onClick={() => toggleSort('id')}>
              ID
            </button>
            <button className="thbtn" onClick={() => toggleSort('name')}>
              Имя
            </button>
            <button className="thbtn" onClick={() => toggleSort('matches')}>
              Назначений
            </button>
            <div>Действия</div>
          </div>
          <div className="table__body">
            {rows.length === 0 && (
              <div className="table__row muted">Ничего не найдено</div>
            )}
            {rows.map((r) => (
              <div className="table__row" key={r.id}>
                <div>#{r.id}</div>
                <div>
                  {editId === r.id ? (
                    <input
                      className="input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      style={{ width: 260 }}
                    />
                  ) : (
                    r.name
                  )}
                </div>
                <div>{r._count?.matchRefs ?? 0}</div>
                <div className="table__actions">
                  {editId === r.id ? (
                    <>
                      <button
                        className="btn btn--sm btn--primary"
                        onClick={() => saveEdit(r.id)}
                        disabled={loading}
                      >
                        Сохранить
                      </button>
                      <button
                        className="btn btn--sm btn--ghost"
                        onClick={() => {
                          setEditId(null);
                          setEditName('');
                        }}
                      >
                        Отмена
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="btn btn--sm"
                        onClick={() => setViewRef(r)}
                      >
                        Просмотр
                      </button>
                      <button
                        className="btn btn--sm"
                        onClick={() => {
                          setEditId(r.id);
                          setEditName(r.name || '');
                        }}
                      >
                        Редакт.
                      </button>
                      <button
                        className="btn btn--sm btn--danger"
                        onClick={() => remove(r.id)}
                        disabled={loading}
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

        {/* Пагинация */}
        <div className="pager">
          <button
            className="btn btn--ghost"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page <= 0}
          >
            « Назад
          </button>
          <div className="pager__info">
            Стр. {page + 1} из {pagesTotal} • всего {total}
          </div>
          <button
            className="btn btn--ghost"
            onClick={() => setPage((p) => Math.min(pagesTotal - 1, p + 1))}
            disabled={page >= pagesTotal - 1}
          >
            Вперёд »
          </button>
        </div>
      </section>

      {/* Создание */}
      <section className="card">
        <h3>Добавить судью</h3>
        <form className="form" onSubmit={createReferee}>
          <div className="form__row">
            <label className="field field--grow">
              <span className="field__label">Имя</span>
              <input
                className="input"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="например: Иван Иванов"
              />
            </label>
            <div className="form__actions">
              <button
                className="btn btn--primary"
                type="submit"
                disabled={loading}
              >
                Добавить
              </button>
            </div>
          </div>
        </form>
      </section>

      {viewRef && (
        <RefereeStatsModal referee={viewRef} onClose={() => setViewRef(null)} />
      )}
    </div>
  );
}
