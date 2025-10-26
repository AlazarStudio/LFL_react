import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import serverConfig from '../../../../../serverConfig';
import './LeagueTeamsTab.css';
import { color } from 'framer-motion';

const API_LEAGUES = `${serverConfig}/leagues`;
const API_TEAMS = `${serverConfig}/teams`;
const API_PLAYERS = `${serverConfig}/players`;
const API_MATCHES = `${serverConfig}/matches`;

/* ====================== Toasts ====================== */
function ToastContainer({ items, onDismiss }) {
  if (!items?.length) return null;
  return createPortal(
    <div
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 9999999,
        pointerEvents: 'none',
        color: 'white',
      }}
    >
      {items.map((t) => {
        const palette = {
          success: { bg: '#0da514ff', border: '#badbcc', color: '#ffffff' },
          error: { bg: '#842029', border: '#f5c2c7' },
          info: { bg: '#084298', border: '#b6d4fe' },
        }[t.type || 'info'];
        return (
          <div
            key={t.id}
            role="status"
            style={{
              maxWidth: 420,
              background: palette.bg,
              color: 'white',
              border: `1px solid ${palette.border}`,
              borderRadius: 10,
              padding: '10px 12px',
              boxShadow: '0 6px 20px rgba(0,0,0,.25)',
              pointerEvents: 'auto',
            }}
          >
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ lineHeight: 1.4, flex: 1 }}>{t.message}</div>
              <button
                aria-label="Закрыть"
                onClick={() => onDismiss(t.id)}
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'white',
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </div>,
    document.body
  );
}

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const dismiss = (id) => setToasts((s) => s.filter((t) => t.id !== id));
  const push = (message, type = 'info', ttlMs = 3500) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((s) => [...s, { id, message, type }]);
    if (ttlMs > 0) setTimeout(() => dismiss(id), ttlMs);
  };
  return { toasts, push, dismiss };
}

/* ====== enums для выпадающих списков ====== */
const LINEUP_ROLES = [
  { value: 'STARTER', label: 'Старт' },
  { value: 'SUBSTITUTE', label: 'Запас' },
  { value: 'RESERVE', label: 'Резерв' },
];

const FIELD_POSITIONS = [
  { value: 'GK', label: 'Вратарь' },
  { value: 'RB', label: 'Правый защитник' },
  { value: 'CB', label: 'Центральный защитник' },
  { value: 'LB', label: 'Левый защитник' },
  { value: 'RWB', label: 'Правый вингбек' },
  { value: 'LWB', label: 'Левый вингбек' },
  { value: 'DM', label: 'Опорный полузащитник' },
  { value: 'CM', label: 'Центральный полузащитник' },
  { value: 'AM', label: 'Атакующий полузащитник' },
  { value: 'RW', label: 'Правый вингер' },
  { value: 'LW', label: 'Левый вингер' },
  { value: 'SS', label: 'Второй нападающий' },
  { value: 'ST', label: 'Центральный нападающий' },
];

/* =============== Модалка управления заявкой =============== */
function RosterModal({ leagueId, leagueTeam, onClose, notify }) {
  const ltId = leagueTeam.id; // LeagueTeam id
  const teamId = leagueTeam.team.id; // Team id
  const teamTitle = leagueTeam.team.title;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [teamPlayers, setTeamPlayers] = useState([]); // все игроки команды
  const [roster, setRoster] = useState([]); // [{playerId, number, role, position, notes, player, id?}]
  const [captainPlayerId, setCaptainPlayerId] = useState(null);

  // публикация в матч
  const [matches, setMatches] = useState([]);
  const [publish, setPublish] = useState({
    matchId: '',
    roleFilter: 'ALL',
    reset: true,
  });

  async function loadTeamPlayers() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 500]),
      sort: JSON.stringify(['name', 'ASC']),
      filter: JSON.stringify({ teamId }),
    });
    const res = await fetch(`${API_PLAYERS}?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setTeamPlayers(Array.isArray(data) ? data : []);
  }

  async function loadRoster() {
    const res = await fetch(`${serverConfig}/league-teams/${ltId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

    const list = Array.isArray(data?.roster) ? data.roster : [];
    setRoster(
      list.map((r) => ({
        id: r.id,
        playerId: r.playerId,
        number: r.number ?? '',
        role: r.role ?? 'STARTER',
        position: r.position ?? '',
        notes: r.notes ?? '',
        player: r.player,
      }))
    );
    setCaptainPlayerId(data?.captainRosterItem?.playerId ?? null);
  }

  async function loadTeamMatches() {
    // матчи этой лиги, где участвует команда
    const params = new URLSearchParams({
      range: JSON.stringify([0, 500]),
      sort: JSON.stringify(['date', 'ASC']),
      filter: JSON.stringify({
        leagueId,
        teamAnyId: teamId, // если на бэке нет такого фильтра — используйте OR: две выборки team1Id/team2Id и склейку
      }),
    });
    const res = await fetch(`${API_MATCHES}?${params.toString()}`);
    const data = await res.json().catch(() => []);
    if (res.ok && Array.isArray(data)) {
      setMatches(
        data.filter((m) => m.team1Id === teamId || m.team2Id === teamId)
      );
    } else {
      setMatches([]);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await Promise.all([loadTeamPlayers(), loadRoster(), loadTeamMatches()]);
      } catch (e) {
        console.error(e);
        setErr(e.message || 'Ошибка загрузки заявки');
        notify?.(e.message || 'Ошибка загрузки заявки', 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ltId]);

  const inRosterIds = useMemo(
    () => new Set(roster.map((r) => r.playerId)),
    [roster]
  );

  function addToRoster(p, role = 'STARTER') {
    if (inRosterIds.has(p.id)) return;
    setRoster((s) => [
      ...s,
      {
        playerId: p.id,
        number: p.number ?? '',
        role,
        position: '',
        notes: '',
        player: p,
      },
    ]);
  }

  function removeFromRoster(playerId) {
    setRoster((s) => s.filter((r) => r.playerId !== playerId));
    if (captainPlayerId === playerId) setCaptainPlayerId(null);
  }

  function updateRoster(playerId, patch) {
    setRoster((s) =>
      s.map((r) => (r.playerId === playerId ? { ...r, ...patch } : r))
    );
  }

  async function saveRoster() {
    try {
      setLoading(true);
      setErr('');
      const payload = {
        items: roster.map((r) => ({
          playerId: r.playerId,
          number: r.number === '' ? null : Number(r.number),
          position: r.position || null,
          role: r.role || null,
          notes: r.notes || null,
        })),
        captainPlayerId: captainPlayerId || null,
      };
      const res = await fetch(`${serverConfig}/league-teams/${ltId}/roster`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadRoster();
      notify?.('Заявка сохранена', 'success');
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось сохранить заявку');
      notify?.(e.message || 'Не удалось сохранить заявку', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function publishRoster() {
    try {
      if (!publish.matchId) throw new Error('Выберите матч');
      setLoading(true);
      setErr('');
      const res = await fetch(`${serverConfig}/league-teams/${ltId}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchId: Number(publish.matchId),
          reset: !!publish.reset,
          roleFilter: publish.roleFilter,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

      // Если сервер вернул какие-то цифры — покажем их. Иначе кратко.
      const details = [];
      if (typeof data.publishedCount === 'number')
        details.push(`опубликовано: ${data.publishedCount}`);
      if (typeof data.replacedCount === 'number')
        details.push(`заменено: ${data.replacedCount}`);
      notify?.(
        `Заявка опубликована в матч #${publish.matchId}` +
          (details.length ? ` (${details.join(', ')})` : '') +
          ` • состав: ${
            publish.roleFilter === 'STARTER' ? 'только старт' : 'все'
          } • перезапись: ${publish.reset ? 'да' : 'нет'}`,
        'success'
      );
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось опубликовать заявку');
      notify?.(e.message || 'Не удалось опубликовать заявку', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal roster-modal" onClick={onClose}>
      <div className="modal__backdrop" />
      <div
        className="modal__dialog roster-modal__dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h3 className="modal__title">Заявка команды: {teamTitle}</h3>
          <button className="btn btn--ghost" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal__body">
          {err && <div className="alert alert--error">{err}</div>}

          <div className="roster-grid">
            {/* Левая колонка — все игроки команды */}
            <section className="card roster-col">
              <h4>Игроки команды</h4>
              <div className="roster-list">
                {teamPlayers.map((p) => (
                  <div key={p.id} className="roster-row">
                    <div className="roster-row__info">
                      <span>{p.name}</span>
                      {p.number != null && (
                        <span className="muted">#{p.number}</span>
                      )}
                    </div>
                    <div className="roster-row__actions">
                      {!inRosterIds.has(p.id) ? (
                        <>
                          <button
                            className="btn btn--sm"
                            onClick={() => addToRoster(p, 'STARTER')}
                            disabled={loading}
                          >
                            + Старт
                          </button>
                          <button
                            className="btn btn--sm btn--ghost"
                            onClick={() => addToRoster(p, 'SUBSTITUTE')}
                            disabled={loading}
                          >
                            + Запас
                          </button>
                        </>
                      ) : (
                        <span className="badge1">в заявке</span>
                      )}
                    </div>
                  </div>
                ))}
                {teamPlayers.length === 0 && (
                  <div className="muted">Нет игроков в команде</div>
                )}
              </div>
            </section>

            {/* Правая колонка — заявка */}
            <section className="card roster-col">
              <h4>Заявка в лиге</h4>
              <div className="roster-list">
                {roster.length === 0 && <div className="muted">Пусто</div>}
                {roster.map((r) => (
                  <div
                    key={r.playerId}
                    className="roster-row roster-row--editable"
                  >
                    <div className="roster-row__info1">
                      <span>{r.player?.name}</span>
                      <span className="muted">
                        #{r.number || r.player?.number || '—'}
                      </span>
                    </div>

                    <div className="roster-edit">
                      <label className="roster-field roster-field--num">
                        <span>№</span>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={r.number}
                          onChange={(e) =>
                            updateRoster(r.playerId, { number: e.target.value })
                          }
                        />
                      </label>

                      <label className="roster-field">
                        <span>Роль</span>
                        <select
                          className="input"
                          value={r.role}
                          onChange={(e) =>
                            updateRoster(r.playerId, { role: e.target.value })
                          }
                        >
                          {LINEUP_ROLES.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="roster-field">
                        <span>Позиция</span>
                        <select
                          className="input"
                          value={r.position}
                          onChange={(e) =>
                            updateRoster(r.playerId, {
                              position: e.target.value,
                            })
                          }
                        >
                          <option value="">—</option>
                          {FIELD_POSITIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="roster-field roster-field--cap">
                        <input
                          type="radio"
                          name="captain"
                          checked={captainPlayerId === r.playerId}
                          onChange={() => setCaptainPlayerId(r.playerId)}
                        />
                        <span>Капитан</span>
                      </label>

                      <button
                        className="btn btn--sm "
                        onClick={() => removeFromRoster(r.playerId)}
                        disabled={loading}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="form__actions" style={{ marginTop: 8 }}>
                <button
                  className="btn btn--primary"
                  onClick={saveRoster}
                  disabled={loading}
                >
                  Сохранить заявку
                </button>
              </div>

              <hr className="sep" />

              <div className="publish">
                <h5>Опубликовать в матч</h5>
                <div className="publish__row">
                  <label className="field">
                    <span className="field__label">Матч</span>
                    <select
                      className="input"
                      value={publish.matchId}
                      onChange={(e) =>
                        setPublish((s) => ({ ...s, matchId: e.target.value }))
                      }
                    >
                      <option value="">—</option>
                      {matches.map((m) => (
                        <option key={m.id} value={m.id}>
                          #{m.id} — {new Date(m.date).toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field">
                    <span className="field__label">Состав</span>
                    <select
                      className="input"
                      value={publish.roleFilter}
                      onChange={(e) =>
                        setPublish((s) => ({
                          ...s,
                          roleFilter: e.target.value,
                        }))
                      }
                    >
                      <option value="ALL">Все</option>
                      <option value="STARTER">Только старт</option>
                    </select>
                  </label>

                  <label className="field field--checkbox">
                    <input
                      type="checkbox"
                      checked={publish.reset}
                      onChange={(e) =>
                        setPublish((s) => ({ ...s, reset: e.target.checked }))
                      }
                    />
                    <span>Перезаписать существующих</span>
                  </label>

                  <div
                    className="form__actions"
                    style={{ alignSelf: 'flex-end' }}
                  >
                    <button
                      className="btn"
                      onClick={publishRoster}
                      disabled={loading || !publish.matchId}
                    >
                      Опубликовать
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
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

/* =============== Основная вкладка команд лиги =============== */
export default function LeagueTeamsTab({ leagueId }) {
  const [allTeams, setAllTeams] = useState([]);
  const [leagueTeams, setLeagueTeams] = useState([]); // [{ id, teamId, team, roster? }]
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const [rosterDlg, setRosterDlg] = useState(null); // { id, team }

  // toasts
  const { toasts, push: notify, dismiss } = useToasts();

  async function loadAllTeams() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 999]),
      sort: JSON.stringify(['title', 'ASC']),
      filter: JSON.stringify(q ? { q } : {}),
    });
    const res = await fetch(`${API_TEAMS}?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setAllTeams(Array.isArray(data) ? data : []);
  }

  async function loadLeagueTeams() {
    const res = await fetch(`${API_LEAGUES}/${leagueId}/teams?include=roster`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    const rows = Array.isArray(data) ? data : [];
    setLeagueTeams(rows);
  }

  async function attach(teamId) {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(
        `${API_LEAGUES}/${leagueId}/teams/${teamId}/attach`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadLeagueTeams();
      notify('Команда добавлена в лигу', 'success');
    } catch (e) {
      console.error(e);
      setErr('Не удалось добавить команду в лигу');
      notify(e.message || 'Не удалось добавить команду в лигу', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function detach(teamId) {
    if (!window.confirm('Убрать команду из лиги?')) return;
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(
        `${API_LEAGUES}/${leagueId}/teams/${teamId}/detach`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadLeagueTeams();
      notify('Команда убрана из лиги', 'success');
    } catch (e) {
      console.error(e);
      setErr('Не удалось убрать команду');
      notify(e.message || 'Не удалось убрать команду', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadAllTeams(), loadLeagueTeams()]);
      } catch (e) {
        console.error(e);
        setErr('Ошибка загрузки команд');
        notify(e.message || 'Ошибка загрузки команд', 'error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  useEffect(() => {
    (async () => {
      try {
        await loadAllTeams();
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const inLeagueIds = useMemo(
    () => new Set(leagueTeams.map((lt) => lt.teamId)),
    [leagueTeams]
  );

  return (
    <div className="grid">
      {/* Верхняя панель с кнопкой */}
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button
          className="btn btn--primary"
          onClick={() =>
            setShowAdd((s) => {
              const next = !s;
              if (!next) setQ('');
              return next;
            })
          }
          disabled={loading}
        >
          {showAdd ? 'Закрыть подбор' : 'Добавить команду'}
        </button>
      </div>

      {/* card2 — подбор команд */}
      {showAdd && (
        <section className="card2">
          <h3>Все команды</h3>
          <div className="teams__search" style={{ marginBottom: 8 }}>
            <input
              className="input"
              placeholder="Поиск…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {allTeams.map((t) => (
            <div key={t.id} className="list-row2">
              <div>
                <b>{t.title}</b>{' '}
                <span className="muted">({t.city || '—'})</span>
              </div>
              <div>
                {!inLeagueIds.has(t.id) ? (
                  <button
                    className="btn btn--sm"
                    onClick={() => attach(t.id)}
                    disabled={loading}
                  >
                    Добавить
                  </button>
                ) : (
                  <span className="badge1">в лиге</span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* card1 — команды в лиге */}
      <section className="card1">
        <h3>Команды в лиге</h3>
        {err && <div className="alert alert--error">{err}</div>}
        {leagueTeams.length === 0 && <div className="muted">Пусто</div>}
        {leagueTeams.map((lt) => (
          <div key={lt.id} className="list-row1">
            <div className="list-row1-info">
              <b>{lt.team?.title}</b>{' '}
              <span className="muted">({lt.team?.city || '—'})</span>
            </div>
            <div className="list-row1-actions">
              <button className="btn btn--sm" onClick={() => setRosterDlg(lt)}>
                Состав
              </button>
              <button
                className="btn btn--sm "
                onClick={() => detach(lt.teamId)}
                disabled={loading}
              >
                Убрать
              </button>
            </div>
          </div>
        ))}
      </section>

      {rosterDlg && (
        <RosterModal
          leagueId={leagueId}
          leagueTeam={rosterDlg}
          onClose={() => setRosterDlg(null)}
          notify={notify}
        />
      )}

      {/* Toasts */}
      <ToastContainer items={toasts} onDismiss={dismiss} />
    </div>
  );
}
