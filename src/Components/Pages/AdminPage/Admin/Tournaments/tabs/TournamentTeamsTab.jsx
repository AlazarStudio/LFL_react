import React, { useEffect, useMemo, useState } from 'react';
import serverConfig from '../../../../../../serverConfig';
// import { toast } from '../../common/toast';

const API_T = `${serverConfig}/tournaments`;
const API_TEAMS = `${serverConfig}/teams`;
const API_PLAYERS = `${serverConfig}/players`;
const API_T_MATCHES = `${serverConfig}/tournaments`; // /:id/matches

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

function RosterModal({ tournamentId, tt, onClose }) {
  const ttId = tt.id;
  const teamId = tt.team.id;
  const teamTitle = tt.team.title;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [teamPlayers, setTeamPlayers] = useState([]);
  const [roster, setRoster] = useState([]); // [{playerId, number, role, position, notes, player, id?}]
  const [captainPlayerId, setCaptainPlayerId] = useState(null);

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
    const res = await fetch(`${serverConfig}/tournament-teams/${ttId}`);
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
  async function loadMatches() {
    const params = new URLSearchParams({
      range: JSON.stringify([0, 500]),
      sort: JSON.stringify(['date', 'ASC']),
      filter: JSON.stringify({}),
    });
    const res = await fetch(
      `${API_T_MATCHES}/${tournamentId}/matches?${params.toString()}`
    );
    const data = await res.json().catch(() => []);
    if (res.ok && Array.isArray(data)) {
      // матчи турнира где участвует эта команда (по TT.id)
      setMatches(data.filter((m) => [m.team1TTId, m.team2TTId].includes(ttId)));
    } else setMatches([]);
  }
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await Promise.all([loadTeamPlayers(), loadRoster(), loadMatches()]);
      } catch (e) {
        setErr(e.message || 'Ошибка загрузки заявки');
      } finally {
        setLoading(false);
      }
    })();
  }, [ttId]);

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
      const res = await fetch(
        `${serverConfig}/tournament-teams/${ttId}/roster`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      //   toast('Заявка сохранена', 'success');
      await loadRoster();
    } catch (e) {
      setErr(e.message || 'Не удалось сохранить заявку');
      //   toast('Не удалось сохранить заявку', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function publishRoster() {
    try {
      if (!publish.matchId) throw new Error('Выберите матч');
      setLoading(true);
      setErr('');
      const res = await fetch(
        `${serverConfig}/tournament-teams/${ttId}/publish`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchId: Number(publish.matchId),
            reset: !!publish.reset,
            roleFilter: publish.roleFilter,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      //   toast('Заявка опубликована в матч', 'success');
    } catch (e) {
      setErr(e.message || 'Не удалось опубликовать заявку');
      //   toast(e.message || 'Не удалось опубликовать заявку', 'error');
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
          <h3 className="modal__title">Заявка турнира: {teamTitle}</h3>
          <button className="btn btn--ghost" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal__body">
          {err && <div className="alert alert--error">{err}</div>}

          <div className="roster-grid">
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
                  <div className="muted">Нет игроков</div>
                )}
              </div>
            </section>

            <section className="card roster-col">
              <h4>Заявка</h4>
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

export default function TournamentTeamsTab({ tournamentId }) {
  const [allTeams, setAllTeams] = useState([]);
  const [ttRows, setTtRows] = useState([]); // TournamentTeam[]
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [rosterDlg, setRosterDlg] = useState(null); // TT

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
  async function loadTT() {
    const res = await fetch(`${API_T}/${tournamentId}/teams?include=roster`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    setTtRows(Array.isArray(data) ? data : []);
  }

  async function attach(teamId) {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(
        `${API_T}/${tournamentId}/teams/${teamId}/attach`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      //   toast('Команда добавлена', 'success');
      await loadTT();
    } catch (e) {
      setErr('Не удалось добавить команду');
      //   toast('Не удалось добавить команду', 'error');
    } finally {
      setLoading(false);
    }
  }
  async function detach(teamId) {
    if (!window.confirm('Убрать команду из турнира?')) return;
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(
        `${API_T}/${tournamentId}/teams/${teamId}/detach`,
        { method: 'DELETE' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      //   toast('Команда убрана', 'success');
      await loadTT();
    } catch (e) {
      setErr('Не удалось убрать команду');
      //   toast('Не удалось убрать команду', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await Promise.all([loadAllTeams(), loadTT()]);
      } catch (e) {
        setErr('Ошибка загрузки команд');
      } finally {
        setLoading(false);
      }
    })();
  }, [tournamentId]);

  useEffect(() => {
    (async () => {
      try {
        await loadAllTeams();
      } catch {}
    })();
  }, [q]);

  const inTournamentIds = useMemo(
    () => new Set(ttRows.map((tt) => tt.teamId)),
    [ttRows]
  );

  return (
    <div className="grid">
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
                {!inTournamentIds.has(t.id) ? (
                  <button
                    className="btn btn--sm"
                    onClick={() => attach(t.id)}
                    disabled={loading}
                  >
                    Добавить
                  </button>
                ) : (
                  <span className="badge1">в турнире</span>
                )}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card1">
        <h3>Команды в турнире</h3>
        {err && <div className="alert alert--error">{err}</div>}
        {ttRows.length === 0 && <div className="muted">Пусто</div>}
        {ttRows.map((tt) => (
          <div key={tt.id} className="list-row1">
            <div className="list-row1-info">
              <b>{tt.team?.title}</b>{' '}
              <span className="muted">({tt.team?.city || '—'})</span>
              {tt.seed != null && (
                <span className="badge1" style={{ marginLeft: 8 }}>
                  Seed #{tt.seed}
                </span>
              )}
            </div>
            <div className="list-row1-actions">
              <button className="btn btn--sm" onClick={() => setRosterDlg(tt)}>
                Заявка
              </button>
              <button
                className="btn btn--sm "
                onClick={() => detach(tt.teamId)}
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
          tournamentId={tournamentId}
          tt={rosterDlg}
          onClose={() => setRosterDlg(null)}
        />
      )}
    </div>
  );
}
