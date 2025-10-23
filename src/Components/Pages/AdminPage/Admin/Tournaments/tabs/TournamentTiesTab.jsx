import React, { useEffect, useState } from 'react';
import serverConfig from '../../../../../../serverConfig';
// import { toast } from '../../common/toast';

export default function TournamentTiesTab({ tournamentId }) {
  const [ties, setTies] = useState([]);
  const [rounds, setRounds] = useState([]);
  const [tts, setTts] = useState([]); // tournament-teams
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({
    roundId: '',
    team1TTId: '',
    team2TTId: '',
    legs: 1,
  });

  async function loadAll() {
    const [rRes, ttRes, tieRes] = await Promise.all([
      fetch(`${serverConfig}/tournaments/${tournamentId}/rounds`),
      fetch(`${serverConfig}/tournaments/${tournamentId}/teams`),
      fetch(`${serverConfig}/tournaments/${tournamentId}/ties`),
    ]);
    const [r, tt, t] = await Promise.all([
      rRes.json(),
      ttRes.json(),
      tieRes.json(),
    ]);
    if (!rRes.ok) throw new Error(r?.error || 'rounds err');
    if (!ttRes.ok) throw new Error(tt?.error || 'teams err');
    if (!tieRes.ok) throw new Error(t?.error || 'ties err');
    setRounds(Array.isArray(r) ? r : []);
    setTts(Array.isArray(tt) ? tt : []);
    setTies(Array.isArray(t) ? t : []);
  }
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadAll();
      } catch (e) {
        setErr('Ошибка загрузки');
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
        `${serverConfig}/tournaments/${tournamentId}/ties`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roundId: Number(form.roundId),
            team1TTId: Number(form.team1TTId),
            team2TTId: Number(form.team2TTId),
            legs: Number(form.legs) || 1,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось создать пару');
    //   toast('Пара создана', 'success');
      setForm({ roundId: '', team1TTId: '', team2TTId: '', legs: 1 });
      await loadAll();
    } catch (e) {
      setErr(e.message);
    //   toast(e.message, 'error');
    }
  }

  async function save(row) {
    try {
      const res = await fetch(`${serverConfig}/tournament-ties/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: row.roundId,
          team1TTId: row.team1TTId,
          team2TTId: row.team2TTId,
          legs: row.legs,
          winnerTTId: row.winnerTTId ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось сохранить');
    //   toast('Сохранено', 'success');
      await loadAll();
    } catch (e) {
    //   toast(e.message, 'error');
    }
  }

  async function recalc(row) {
    try {
      const res = await fetch(
        `${serverConfig}/tournament-ties/${row.id}/recalc`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Ошибка пересчёта');
    //   toast(
    //     `Пересчитано (сумма голов: ${data?.aggregate?.team1 ?? 0} - ${
    //       data?.aggregate?.team2 ?? 0
    //     })`,
    //     'success'
    //   );
      await loadAll();
    } catch (e) {
    //   toast(e.message, 'error');
    }
  }

  async function remove(id) {
    if (!window.confirm('Удалить пару?')) return;
    try {
      const res = await fetch(`${serverConfig}/tournament-ties/${id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Не удалось удалить');
    //   toast('Удалено', 'success');
      await loadAll();
    } catch (e) {
    //   toast(e.message, 'error');
    }
  }

  return (
    <div className="grid onecol">
      <section className="card">
        <h3>Создать пару</h3>
        {err && <div className="alert alert--error">{err}</div>}
        <form className="form" onSubmit={create}>
          <div className="form__row">
            <label className="field">
              <span className="field__label">Раунд</span>
              <select
                className="input"
                value={form.roundId}
                onChange={(e) =>
                  setForm((s) => ({ ...s, roundId: e.target.value }))
                }
                required
              >
                <option value="">—</option>
                {rounds.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name || r.stage}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Команда 1</span>
              <select
                className="input"
                value={form.team1TTId}
                onChange={(e) =>
                  setForm((s) => ({ ...s, team1TTId: e.target.value }))
                }
                required
              >
                <option value="">—</option>
                {tts.map((tt) => (
                  <option key={tt.id} value={tt.id}>
                    {tt.team?.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Команда 2</span>
              <select
                className="input"
                value={form.team2TTId}
                onChange={(e) =>
                  setForm((s) => ({ ...s, team2TTId: e.target.value }))
                }
                required
              >
                <option value="">—</option>
                {tts.map((tt) => (
                  <option key={tt.id} value={tt.id}>
                    {tt.team?.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Матчей в паре</span>
              <input
                className="input"
                type="number"
                min={1}
                max={3}
                value={form.legs}
                onChange={(e) =>
                  setForm((s) => ({ ...s, legs: e.target.value }))
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
        <h3>Пары</h3>
        <div className="table">
          <div className="table__head">
            <div>ID</div>
            <div>Раунд</div>
            <div>Команда 1</div>
            <div>Команда 2</div>
            <div>Матчей</div>
            <div>Победитель</div>
            <div>Действия</div>
          </div>
          <div className="table__body">
            {ties.length === 0 && <div className="table__row muted">Пусто</div>}
            {ties.map((t) => (
              <div className="table__row" key={t.id}>
                <div>#{t.id}</div>
                <div>{t.round?.name || t.round?.stage || '—'}</div>
                <div>{t.team1TT?.team?.title || '—'}</div>
                <div>{t.team2TT?.team?.title || '—'}</div>
                <div>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={t.legs || 1}
                    onChange={(e) =>
                      setTies((s) =>
                        s.map((x) =>
                          x.id === t.id
                            ? { ...x, legs: Number(e.target.value) || 1 }
                            : x
                        )
                      )
                    }
                    style={{ width: 90 }}
                  />
                </div>
                <div>
                  <select
                    className="input"
                    value={t.winnerTTId ?? ''}
                    onChange={(e) =>
                      setTies((s) =>
                        s.map((x) =>
                          x.id === t.id
                            ? {
                                ...x,
                                winnerTTId:
                                  e.target.value === ''
                                    ? null
                                    : Number(e.target.value),
                              }
                            : x
                        )
                      )
                    }
                  >
                    <option value="">—</option>
                    {[t.team1TT, t.team2TT].filter(Boolean).map((tt) => (
                      <option key={tt.id} value={tt.id}>
                        {tt.team?.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="table__actions">
                  <button className="btn btn--sm" onClick={() => save(t)}>
                    Сохранить
                  </button>
                  <button className="btn btn--sm" onClick={() => recalc(t)}>
                    Пересчитать
                  </button>
                  <button
                    className="btn btn--sm btn--danger"
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
