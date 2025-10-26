// src/admin/Players/AdminPlayers.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import serverConfig from '../../../../serverConfig'; // например: http://localhost:5000/api
import uploadsConfig from '../../../../uploadsConfig'; // например: http://localhost:5000
import '../Teams/Teams.css'; // переиспользуем стили таблиц/форм

const PLAYERS_API = `${serverConfig}/players`;
const TEAMS_API = `${serverConfig}/teams`;
const UPLOAD_API = `${serverConfig}/upload`;
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');
const buildSrc = (p) =>
  !p ? '' : /^https?:\/\//i.test(p) ? p : `${ASSETS_BASE}${p}`;

const POSITIONS = [
  ['GK', 'Вратарь'],
  ['RB', 'Правый защитник'],
  ['CB', 'Центральный защитник'],
  ['LB', 'Левый защитник'],
  ['RWB', 'Правый латераль'],
  ['LWB', 'Левый латераль'],
  ['DM', 'Опорный полузащитник'],
  ['CM', 'Центральный полузащитник'],
  ['AM', 'Атакующий полузащитник'],
  ['RW', 'Правый вингер'],
  ['LW', 'Левый вингер'],
  ['SS', 'Второй нападающий'],
  ['ST', 'Центральный нападающий'],
];
const POS_MAP = Object.fromEntries(POSITIONS);
const positionRu = (code) => POS_MAP[code] || '—';

export default function AdminPlayers() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // ▼▼▼ Новые состояния для скрытия/показа форм
  const [showFilters, setShowFilters] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // ▲▲▲

  // список и фильтры
  const [players, setPlayers] = useState([]);
  const [q, setQ] = useState('');
  const [teamFilter, setTeamFilter] = useState(''); // teamId
  const [leagueFilter, setLeagueFilter] = useState(''); // leagueId
  const [posFilter, setPosFilter] = useState('');
  const [hasUserFilter, setHasUserFilter] = useState(''); // '', 'true', 'false'

  // справочники
  const [teams, setTeams] = useState([]); // для фильтра и форм
  const teamMap = useMemo(
    () => Object.fromEntries(teams.map((t) => [t.id, t.title])),
    [teams]
  );

  // форма
  const [form, setForm] = useState({
    id: null,
    name: '',
    position: '',
    number: '',
    birthDate: '',
    teamId: '',
    images: [],
    userId: '', // опционально
  });
  const isEdit = useMemo(() => form.id != null, [form.id]);
  const imgRef = useRef(null);

  // ------- utils
  const uploadMany = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return [];
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    const res = await fetch(UPLOAD_API, { method: 'POST', body: fd });
    let data = {};
    try {
      data = await res.json();
    } catch {}
    if (!res.ok)
      throw new Error(
        data?.error || data?.message || `Upload HTTP ${res.status}`
      );
    const urls = Array.isArray(data.filePaths) ? data.filePaths : [];
    if (!urls.length) throw new Error('Сервер не вернул пути к файлам');
    return urls;
  };

  const loadTeams = async () => {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 999]),
      sort: JSON.stringify(['title', 'ASC']),
      filter: JSON.stringify({}),
    });
    const res = await fetch(`${TEAMS_API}?${params}`);
    if (!res.ok) throw new Error(`Teams HTTP ${res.status}`);
    const list = await res.json();
    setTeams(Array.isArray(list) ? list : []);
  };

  const buildFilterQS = () => {
    const filter = {};
    if (q.trim()) filter.q = q.trim();
    if (teamFilter) filter.teamId = Number(teamFilter);
    if (leagueFilter) filter.leagueId = Number(leagueFilter);
    if (posFilter) filter.position = posFilter;
    if (hasUserFilter !== '') filter.hasUser = hasUserFilter;
    return new URLSearchParams({
      range: JSON.stringify([0, 199]),
      sort: JSON.stringify(['id', 'ASC']),
      filter: JSON.stringify(filter),
    });
  };

  const loadPlayers = async () => {
    const qs = buildFilterQS();
    const res = await fetch(`${PLAYERS_API}?${qs}`);
    if (!res.ok) throw new Error(`Players HTTP ${res.status}`);
    const data = await res.json();
    setPlayers(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await loadTeams();
        await loadPlayers();
      } catch (e) {
        console.error(e);
        setErr('Не удалось загрузить данные');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await loadPlayers();
      } catch {}
    })();
  }, [q, teamFilter, leagueFilter, posFilter, hasUserFilter]); // eslint-disable-line

  const resetForm = () => {
    setForm({
      id: null,
      name: '',
      position: '',
      number: '',
      birthDate: '',
      teamId: '',
      images: [],
      userId: '',
    });
    if (imgRef.current) imgRef.current.value = '';
  };
  const startEdit = (p) => {
    setForm({
      id: p.id,
      name: p.name || '',
      position: p.position || '',
      number: p.number ?? '',
      birthDate: p.birthDate ? String(p.birthDate).slice(0, 10) : '',
      teamId: p.teamId || p.team?.id || '',
      images: Array.isArray(p.images) ? p.images : [],
      userId: p.user?.id || '',
    });
    setShowForm(true); // ← при редактировании раскрываем форму
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onUploadImages = async (e) => {
    try {
      setLoading(true);
      setErr('');
      const urls = await uploadMany(e.target.files);
      setForm((s) => ({ ...s, images: [...s.images, ...urls] }));
    } catch (er) {
      setErr(er.message || 'Не удалось загрузить изображения');
    } finally {
      setLoading(false);
      if (imgRef.current) imgRef.current.value = '';
    }
  };
  const removeImg = (u) =>
    setForm((s) => ({ ...s, images: s.images.filter((x) => x !== u) }));

  const save = async (e) => {
    e.preventDefault();
    try {
      if (!form.teamId) throw new Error('Выберите команду');
      setLoading(true);
      setErr('');
      const payload = {
        name: form.name.trim(),
        position: form.position || '',
        number: form.number === '' ? null : Number(form.number),
        birthDate: form.birthDate || null,
        teamId: Number(form.teamId),
        images: form.images,
        userId: form.userId === '' ? undefined : Number(form.userId),
      };
      const url = isEdit ? `${PLAYERS_API}/${form.id}` : PLAYERS_API;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const txt = await res.text();
      if (!res.ok) {
        try {
          const j = JSON.parse(txt);
          throw new Error(j?.error || `Ошибка ${res.status}`);
        } catch {
          throw new Error(txt || `Ошибка ${res.status}`);
        }
      }
      resetForm();
      setShowForm(false); // ← после сохранения сворачиваем форму (можно убрать, если нужно оставлять)
      await loadPlayers();
    } catch (er) {
      console.error(er);
      setErr(er.message || 'Не удалось сохранить игрока');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Удалить игрока?')) return;
    try {
      setLoading(true);
      setErr('');
      const res = await fetch(`${PLAYERS_API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadPlayers();
    } catch (er) {
      console.error(er);
      setErr('Не удалось удалить игрока');
    } finally {
      setLoading(false);
    }
  };

  const [transferTo, setTransferTo] = useState(''); // селект для трансфера
  const doTransfer = async (id) => {
    if (!transferTo) return;
    try {
      setLoading(true);
      setErr('');
      const res = await fetch(`${PLAYERS_API}/${id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toTeamId: Number(transferTo) }),
      });
      const txt = await res.text();
      if (!res.ok) {
        try {
          const j = JSON.parse(txt);
          throw new Error(j?.error || `Ошибка ${res.status}`);
        } catch {
          throw new Error(txt || `Ошибка ${res.status}`);
        }
      }
      setTransferTo('');
      await loadPlayers();
    } catch (er) {
      console.error(er);
      setErr(er.message || 'Не удалось выполнить трансфер');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="teams">
      {/* Header */}
      <header className="teams__header" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div>
          <h1 className="teams__title" style={{}}>
            Игроки
          </h1>

          <button
            className="btn"
            onClick={() => setShowFilters((v) => !v)}
            aria-expanded={showFilters}
            aria-controls="players-filters"
          >
            {showFilters ? 'Скрыть поиск' : 'Поиск'}
          </button>
          <button
            className="btn"
            onClick={() => {
              resetForm();
              setShowForm((v) => !v);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            aria-expanded={showForm}
            aria-controls="players-form"
          >
            {showForm ? 'Скрыть форму' : 'Добавить'}
          </button>
        </div>
      </header>

      {err && <div className="alert alert--error">{err}</div>}
      {loading && <div className="alert">Загрузка…</div>}

      {/* Фильтры (скрываемые) */}
      {showFilters && (
        <section
          className="card"
          style={{ marginBottom: 12 }}
          id="players-filters"
        >
          <div className="form__row">
            <label className="field">
              <span className="field__label">Поиск</span>
              <input
                className="input"
                placeholder="Имя…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Команда</span>
              <select
                className="input"
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
              >
                <option value="">Все</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Лига</span>
              <input
                className="input"
                type="number"
                placeholder="ID лиги"
                value={leagueFilter}
                onChange={(e) => setLeagueFilter(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field__label">Позиция</span>
              <select
                className="input"
                value={posFilter}
                onChange={(e) => setPosFilter(e.target.value)}
              >
                <option value="">Все</option>
                {POSITIONS.map(([code, ru]) => (
                  <option key={code} value={code}>
                    {ru}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Есть пользователь</span>
              <select
                className="input"
                value={hasUserFilter}
                onChange={(e) => setHasUserFilter(e.target.value)}
              >
                <option value="">Не важно</option>
                <option value="true">Да</option>
                <option value="false">Нет</option>
              </select>
            </label>
            <div
              className="form__actions"
              style={{ alignSelf: 'flex-end', display: 'flex', gap: 8 }}
            >
              <button className="btn" onClick={loadPlayers} disabled={loading}>
                Обновить
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  setQ('');
                  setTeamFilter('');
                  setLeagueFilter('');
                  setPosFilter('');
                  setHasUserFilter('');
                }}
              >
                Сбросить
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Форма (скрываемая) */}
      {showForm && (
        <section className="card" id="players-form">
          <form className="form" onSubmit={save}>
            <div className="form__row">
              <label className="field">
                <span className="field__label">Имя</span>
                <input
                  className="input"
                  value={form.name}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, name: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">Команда</span>
                <select
                  className="input"
                  value={form.teamId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, teamId: e.target.value }))
                  }
                  required
                >
                  <option value="">— выберите —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Позиция</span>
                <select
                  className="input"
                  value={form.position}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, position: e.target.value }))
                  }
                >
                  <option value="">—</option>
                  {POSITIONS.map(([code, ru]) => (
                    <option key={code} value={code}>
                      {ru}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field__label">Номер</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={form.number}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, number: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Дата рождения</span>
                <input
                  className="input"
                  type="date"
                  value={form.birthDate}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, birthDate: e.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">UserId (опц.)</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={form.userId}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, userId: e.target.value }))
                  }
                />
              </label>
            </div>

            <div className="form__row">
              <label className="field">
                <span className="field__label">Фото</span>
                <div className="upload">
                  <input
                    ref={imgRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onUploadImages}
                    className="upload__input"
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => imgRef.current?.click()}
                    disabled={loading}
                  >
                    Выбрать
                  </button>
                </div>
                {form.images?.length > 0 && (
                  <div className="thumbs">
                    {form.images.map((u) => (
                      <div className="thumb" key={u}>
                        <img src={buildSrc(u)} alt="" />
                        <button
                          type="button"
                          className="thumb__remove"
                          onClick={() => removeImg(u)}
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

      {/* Таблица */}
      <section className="card">
        <div className="table">
          <div className="table__head">
            <div>ID</div>
            <div>Фото</div>
            <div>Имя</div>
            <div>Команда</div>
            <div>Поз.</div>
            <div>№</div>
            <div>Д.р.</div>
            <div>Действия</div>
          </div>
          <div className="table__body">
            {players.map((p) => (
              <div className="table__row" key={p.id}>
                <div>#{p.id}</div>
                <div>
                  {p.images?.length ? (
                    <img
                      src={buildSrc(p.images[0])}
                      alt=""
                      style={{
                        maxWidth: 48,
                        maxHeight: 48,
                        objectFit: 'cover',
                        borderRadius: 6,
                      }}
                    />
                  ) : (
                    '—'
                  )}
                </div>
                <div className="cell-strong">{p.name}</div>
                <div>{p.team?.title || teamMap[p.teamId] || '—'}</div>
                <div>{positionRu(p.position)}</div>
                <div>{p.number ?? '—'}</div>
                <div>
                  {p.birthDate ? String(p.birthDate).slice(0, 10) : '—'}
                </div>
                <div className="table__actions" style={{ gap: 8 }}>
                  <button className="btn btn--sm" onClick={() => startEdit(p)}>
                    Редактировать
                  </button>
                  <button
                    className="btn "
                    onClick={() => remove(p.id)}
                  >
                    Удалить
                  </button>
                  <div
                    style={{
                      display: 'inline-flex',
                      gap: 6,
                      alignItems: 'center',
                    }}
                  >
                    <select
                      className="input"
                      value={transferTo}
                      onChange={(e) => setTransferTo(e.target.value)}
                      style={{ height: 28 }}
                    >
                      <option value="">→ Трансфер в…</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn--sm"
                      disabled={!transferTo}
                      onClick={() => doTransfer(p.id)}
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {players.length === 0 && (
              <div className="table__row muted">Нет данных</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
