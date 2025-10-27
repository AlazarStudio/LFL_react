// src/admin/Teams/AdminTeamDetails.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import serverConfig from '../../../../serverConfig';
import uploadsConfig from '../../../../uploadsConfig';
import './Teams.css';

const TEAMS_API = `${serverConfig}/teams`;
const PLAYERS_API = `${serverConfig}/players`;
const UPLOAD_API = `${serverConfig}/upload`;
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');
const buildSrc = (p) =>
  !p ? '' : /^https?:\/\//i.test(p) ? p : `${ASSETS_BASE}${p}`;

const POSITION_LABEL = {
  GK: 'Вратарь',
  RB: 'Правый защитник',
  CB: 'Центральный защитник',
  LB: 'Левый защитник',
  RWB: 'Правый винг-бэк',
  LWB: 'Левый винг-бэк',
  DM: 'Опорный полузащитник',
  CM: 'Центральный полузащитник',
  AM: 'Атакующий полузащитник',
  RW: 'Правый вингер',
  LW: 'Левый вингер',
  SS: 'Под нападающим',
  ST: 'Нападающий',
};

const FIELD_POSITIONS = Object.keys(POSITION_LABEL);
const posLabel = (code) => POSITION_LABEL[code] || code || '—';

export default function AdminTeamDetails() {
  const { id } = useParams();
  const teamId = Number(id);
  const nav = useNavigate();

  const [tab, setTab] = useState('general'); // 'general' | 'players'
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // team
  const [team, setTeam] = useState(null);
  const [tForm, setTForm] = useState({
    title: '',
    city: '',
    logo: [],
    images: [],
    games: 0,
    wins: 0,
    goals: 0,
  });

  const logoRef = useRef(null);
  const imgsRef = useRef(null);

  // players
  const [q, setQ] = useState('');
  const [players, setPlayers] = useState([]);
  const [pForm, setPForm] = useState({
    id: null,
    name: '',
    position: '',
    number: '',
    birthDate: '',
    images: [],
  });
  const pImgsRef = useRef(null);
  const isEditPlayer = useMemo(() => pForm.id != null, [pForm.id]);

  const uploadMany = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return [];
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    const res = await fetch(UPLOAD_API, { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(
        data?.error || data?.message || `Upload HTTP ${res.status}`
      );
    const urls = Array.isArray(data.filePaths) ? data.filePaths : [];
    if (!urls.length) throw new Error('Сервер не вернул пути к файлам');
    return urls;
  };

  const MATCHES_API = `${serverConfig}/matches`;
  const EVENTS_API = `${serverConfig}/matchEvents`;

  const GOAL_TYPES = new Set(['GOAL', 'PENALTY_GOAL', 'OWN_GOAL']); // под свои enum'ы
  const CARD_TYPES = new Set(['YELLOW_CARD', 'RED_CARD']);

  // helper: счёт из событий
  function computeScore(events, t1Id, t2Id) {
    let s1 = 0,
      s2 = 0;
    for (const ev of events) {
      if (!GOAL_TYPES.has(ev.type)) continue;
      const isOwn = ev.type === 'OWN_GOAL';
      const toTeam1 = isOwn ? ev.teamId === t2Id : ev.teamId === t1Id;
      const toTeam2 = isOwn ? ev.teamId === t1Id : ev.teamId === t2Id;
      if (toTeam1) s1++;
      if (toTeam2) s2++;
    }
    return { team1Score: s1, team2Score: s2 };
  }

  const loadTeam = async () => {
    const res = await fetch(`${TEAMS_API}/${teamId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const t = await res.json();
    setTeam(t);
    setTForm({
      title: t.title || '',
      city: t.city || '',
      logo: Array.isArray(t.logo) ? t.logo : [],
      images: Array.isArray(t.images) ? t.images : [],
    });
  };

  const loadPlayers = async () => {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 199]),
      sort: JSON.stringify(['id', 'ASC']),
      filter: JSON.stringify({ teamId, ...(q ? { q } : {}) }),
    });
    const res = await fetch(`${PLAYERS_API}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setPlayers(Array.isArray(data) ? data : []);
  };

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await loadTeam();
        await loadPlayers();
      } catch (e) {
        console.error(e);
        setErr('Не удалось загрузить данные команды');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    (async () => {
      try {
        await loadPlayers();
      } catch {}
    })();
  }, [q]); // eslint-disable-line

  // --- Team uploads ---
  const onUploadTeamLogo = async (e) => {
    try {
      setLoading(true);
      setErr('');
      const urls = await uploadMany(e.target.files);
      setTForm((s) => ({ ...s, logo: [...s.logo, ...urls] }));
    } catch (er) {
      setErr(er.message || 'Не удалось загрузить логотипы');
    } finally {
      setLoading(false);
      if (logoRef.current) logoRef.current.value = '';
    }
  };

  const onUploadTeamImages = async (e) => {
    try {
      setLoading(true);
      setErr('');
      const urls = await uploadMany(e.target.files);
      setTForm((s) => ({ ...s, images: [...s.images, ...urls] }));
    } catch (er) {
      setErr(er.message || 'Не удалось загрузить изображения');
    } finally {
      setLoading(false);
      if (imgsRef.current) imgsRef.current.value = '';
    }
  };

  const removeTeamImg = (field, url) =>
    setTForm((s) => ({ ...s, [field]: s[field].filter((u) => u !== url) }));

  const saveTeam = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErr('');
      const res = await fetch(`${TEAMS_API}/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: tForm.title.trim(),
          city: tForm.city.trim(),
          logo: tForm.logo,
          images: tForm.images,
          games: Number(tForm.games) || 0,
          wins: Number(tForm.wins) || 0,
          goals: Number(tForm.goals) || 0,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadTeam();
    } catch (er) {
      console.error(er);
      setErr('Не удалось сохранить команду');
    } finally {
      setLoading(false);
    }
  };

  // --- Players CRUD ---
  const resetPForm = () => {
    setPForm({
      id: null,
      name: '',
      position: '',
      number: '',
      birthDate: '',
      images: [],
    });
    if (pImgsRef.current) pImgsRef.current.value = '';
  };

  const startEditPlayer = (p) => {
    setPForm({
      id: p.id,
      name: p.name || '',
      position: p.position || '',
      number: p.number ?? '',
      birthDate: p.birthDate ? String(p.birthDate).slice(0, 10) : '',
      images: Array.isArray(p.images) ? p.images : [],
      games: Number(t.games ?? 0),
      wins: Number(t.wins ?? 0),
      goals: Number(t.goals ?? 0),
    });
  };

  const onUploadPlayerImages = async (e) => {
    try {
      setLoading(true);
      setErr('');
      const urls = await uploadMany(e.target.files);
      setPForm((s) => ({ ...s, images: [...s.images, ...urls] }));
    } catch (er) {
      setErr(er.message || 'Не удалось загрузить фото игрока');
    } finally {
      setLoading(false);
      if (pImgsRef.current) pImgsRef.current.value = '';
    }
  };

  const removePImg = (url) =>
    setPForm((s) => ({ ...s, images: s.images.filter((u) => u !== url) }));

  const savePlayer = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setErr('');
      const payload = {
        name: pForm.name.trim(),
        position: pForm.position || '',
        number: pForm.number === '' ? null : Number(pForm.number),
        birthDate: pForm.birthDate || null,
        images: pForm.images,
        teamId,
      };
      const url = isEditPlayer ? `${PLAYERS_API}/${pForm.id}` : PLAYERS_API;
      const method = isEditPlayer ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      resetPForm();
      await loadPlayers();
    } catch (er) {
      console.error(er);
      setErr('Не удалось сохранить игрока');
    } finally {
      setLoading(false);
    }
  };

  const deletePlayer = async (pid) => {
    if (!window.confirm('Удалить игрока?')) return;
    try {
      setLoading(true);
      setErr('');
      const res = await fetch(`${PLAYERS_API}/${pid}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadPlayers();
    } catch (er) {
      console.error(er);
      setErr('Не удалось удалить игрока');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="teams">
      <header className="teams__header">
        <button className="btn btn--ghost" onClick={() => nav('/admin/teams')}>
          ← Назад
        </button>

        <h1 className="teams__title">
          Команда #{teamId}
          {team?.title ? ` — ${team.title}` : ''}
          {`  ·  И:${team?.games ?? 0}  В:${team?.wins ?? 0}  Г:${
            team?.goals ?? 0
          }`}
        </h1>
      </header>

      {err && <div className="alert alert--error">{err}</div>}
      {loading && <div className="alert">Загрузка…</div>}

      <div className="tabs">
        <button
          className={`tab ${tab === 'general' ? 'active' : ''}`}
          onClick={() => setTab('general')}
        >
          Общая
        </button>
        <button
          className={`tab ${tab === 'players' ? 'active' : ''}`}
          onClick={() => setTab('players')}
        >
          Игроки
        </button>
        <button
          className={`tab ${tab === 'matches' ? 'active' : ''}`}
          onClick={() => setTab('matches')}
        >
          Матчи
        </button>
      </div>

      {tab === 'general' && (
        <section className="card">
          <form className="form" onSubmit={saveTeam}>
            <div className="form__row">
              <label className="field">
                <span className="field__label">Название</span>
                <input
                  className="input"
                  value={tForm.title}
                  onChange={(e) =>
                    setTForm((s) => ({ ...s, title: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">Город</span>
                <input
                  className="input"
                  value={tForm.city}
                  onChange={(e) =>
                    setTForm((s) => ({ ...s, city: e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="form__row">
              <label className="field">
                <span className="field__label">Игры</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={tForm.games}
                  onChange={(e) =>
                    setTForm((s) => ({
                      ...s,
                      games: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Победы</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={tForm.wins}
                  onChange={(e) =>
                    setTForm((s) => ({
                      ...s,
                      wins: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>
              <label className="field">
                <span className="field__label">Голы</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  value={tForm.goals}
                  onChange={(e) =>
                    setTForm((s) => ({
                      ...s,
                      goals: Number(e.target.value || 0),
                    }))
                  }
                />
              </label>
            </div>

            <div className="form__row">
              <label className="field">
                <span className="field__label">Логотипы</span>
                <div className="upload">
                  <input
                    ref={logoRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onUploadTeamLogo}
                    className="upload__input"
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => logoRef.current?.click()}
                    disabled={loading}
                  >
                    Выбрать файлы
                  </button>
                </div>
                {tForm.logo?.length > 0 && (
                  <div className="thumbs">
                    {tForm.logo.map((u) => (
                      <div className="thumb" key={u}>
                        <img src={buildSrc(u)} alt="" />
                        <button
                          type="button"
                          className="thumb__remove"
                          onClick={() => removeTeamImg('logo', u)}
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
                    ref={imgsRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={onUploadTeamImages}
                    className="upload__input"
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => imgsRef.current?.click()}
                    disabled={loading}
                  >
                    Выбрать файлы
                  </button>
                </div>
                {tForm.images?.length > 0 && (
                  <div className="thumbs">
                    {tForm.images.map((u) => (
                      <div className="thumb" key={u}>
                        <img src={buildSrc(u)} alt="" />
                        <button
                          type="button"
                          className="thumb__remove"
                          onClick={() => removeTeamImg('images', u)}
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
                Сохранить
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === 'players' && (
        <>
          <section className="card">
            <div
              className="teams__header"
              style={{ padding: 0, marginBottom: 12 }}
            >
              <div className="teams__search">
                <input
                  className="input"
                  placeholder="Поиск по имени/позиции…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <button
                  className="btn"
                  onClick={loadPlayers}
                  disabled={loading}
                >
                  Обновить
                </button>
              </div>
            </div>

            <form className="form" onSubmit={savePlayer}>
              <div className="form__row">
                <label className="field">
                  <span className="field__label">Имя</span>
                  <input
                    className="input"
                    value={pForm.name}
                    onChange={(e) =>
                      setPForm((s) => ({ ...s, name: e.target.value }))
                    }
                    required
                  />
                </label>
                <label className="field">
                  <span className="field__label">Позиция</span>
                  <select
                    className="input"
                    value={pForm.position}
                    onChange={(e) =>
                      setPForm((s) => ({ ...s, position: e.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {FIELD_POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        {posLabel(p)}
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
                    value={pForm.number}
                    onChange={(e) =>
                      setPForm((s) => ({ ...s, number: e.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span className="field__label">Дата рождения</span>
                  <input
                    className="input"
                    type="date"
                    value={pForm.birthDate}
                    onChange={(e) =>
                      setPForm((s) => ({ ...s, birthDate: e.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="form__row">
                <label className="field">
                  <span className="field__label">Фото игрока</span>
                  <div className="upload">
                    <input
                      ref={pImgsRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={onUploadPlayerImages}
                      className="upload__input"
                    />
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={() => pImgsRef.current?.click()}
                      disabled={loading}
                    >
                      Выбрать фото
                    </button>
                  </div>
                  {pForm.images?.length > 0 && (
                    <div className="thumbs">
                      {pForm.images.map((u) => (
                        <div className="thumb" key={u}>
                          <img src={buildSrc(u)} alt="" />
                          <button
                            type="button"
                            className="thumb__remove"
                            onClick={() => removePImg(u)}
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
                  {isEditPlayer ? 'Сохранить игрока' : 'Добавить игрока'}
                </button>
                {isEditPlayer && (
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={resetPForm}
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
                <div>Фото</div>
                <div>Имя</div>
                <div>Позиция</div>
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
                    <div>{posLabel(p.position)}</div>
                    <div>{p.number ?? '—'}</div>
                    <div>
                      {p.birthDate ? String(p.birthDate).slice(0, 10) : '—'}
                    </div>
                    <div className="table__actions">
                      <button
                        className="btn btn--sm"
                        onClick={() => startEditPlayer(p)}
                      >
                        Редактировать
                      </button>
                      <button
                        className="btn btn--sm "
                        onClick={() => deletePlayer(p.id)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
                {players.length === 0 && (
                  <div className="table__row muted">Нет игроков</div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
