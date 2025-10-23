import React, { useEffect, useMemo, useState } from 'react';
import serverConfig from '../../../../../../serverConfig';
// import './TournamentBracketTab.css';

const API_TOURN = `${serverConfig}/tournaments`;
const API_ROUND = `${serverConfig}/tournament-rounds`;
const API_TIE = `${serverConfig}/tournament-ties`;

const STAGES = [
  'ROUND_OF_32',
  'ROUND_OF_16',
  'QUARTERFINAL',
  'SEMIFINAL',
  'FINAL',
  'THIRD_PLACE',
];

export default function TournamentBracketTab({ tournamentId }) {
  const [rounds, setRounds] = useState([]);
  const [ties, setTies] = useState([]);
  const [teams, setTeams] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const [gen, setGen] = useState({
    mode: 'seed',
    legs: 1,
    includeThirdPlace: false,
    createMatches: true,
    startDate: '',
    reset: false,
  });

  async function loadAll() {
    const [rRes, tRes, ttRes] = await Promise.all([
      fetch(`${API_TOURN}/${tournamentId}/rounds`),
      fetch(`${API_TOURN}/${tournamentId}/ties`),
      fetch(`${API_TOURN}/${tournamentId}/teams`),
    ]);
    const r = await rRes.json();
    const t = await tRes.json();
    const tt = await ttRes.json();
    if (!rRes.ok) throw new Error(r?.error || `HTTP ${rRes.status}`);
    if (!tRes.ok) throw new Error(t?.error || `HTTP ${tRes.status}`);
    if (!ttRes.ok) throw new Error(tt?.error || `HTTP ${ttRes.status}`);
    setRounds(Array.isArray(r) ? r : []);
    setTies(Array.isArray(t) ? t : []);
    setTeams(Array.isArray(tt) ? tt : []);
  }
  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr('');
        await loadAll();
      } catch (e) {
        console.error(e);
        setErr('Ошибка загрузки');
      } finally {
        setLoading(false);
      }
    })();
  }, [tournamentId]);

  const roundById = useMemo(
    () => Object.fromEntries(rounds.map((r) => [r.id, r])),
    [rounds]
  );
  const groupedTies = useMemo(() => {
    const m = new Map();
    for (const t of ties) {
      const r = roundById[t.roundId];
      const key = r
        ? `${r.stage}${r.number ? ` #${r.number}` : ''}`
        : 'Без раунда';
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(t);
    }
    return m;
  }, [ties, roundById]);

  async function createRound() {
    const stage = window.prompt('Стадия (например SEMIFINAL):', 'SEMIFINAL');
    if (!stage) return;
    try {
      const res = await fetch(`${API_TOURN}/${tournamentId}/rounds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadAll();
    } catch (e) {
      console.error(e);
      alert('Не удалось создать раунд');
    }
  }
  async function deleteRound(roundId) {
    if (!window.confirm('Удалить раунд?')) return;
    try {
      const res = await fetch(`${API_ROUND}/${roundId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadAll();
    } catch (e) {
      console.error(e);
      alert('Не удалось удалить раунд');
    }
  }
  async function recalcTie(tieId) {
    try {
      const res = await fetch(`${API_TIE}/${tieId}/recalc`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadAll();
    } catch (e) {
      console.error(e);
      alert('Не удалось пересчитать пару');
    }
  }

  async function generateBracket() {
    try {
      setLoading(true);
      setErr('');
      const res = await fetch(`${API_TOURN}/${tournamentId}/bracket/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: gen.mode,
          legs: Number(gen.legs) || 1,
          includeThirdPlace: !!gen.includeThirdPlace,
          createMatches: !!gen.createMatches,
          startDate: gen.startDate || null,
          reset: !!gen.reset,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      await loadAll();
      alert('Сетка сгенерирована');
    } catch (e) {
      console.error(e);
      setErr(e.message || 'Не удалось сгенерировать сетку');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid onecol">
      <section className="card">
        <h3>Генерация сетки</h3>
        {err && <div className="alert alert--error">{err}</div>}
        <div className="form">
          <div className="form__row">
            <label className="field">
              <span className="field__label">Режим</span>
              <select
                className="input"
                value={gen.mode}
                onChange={(e) =>
                  setGen((s) => ({ ...s, mode: e.target.value }))
                }
              >
                <option value="seed">Seed</option>
                <option value="random">Random</option>
                {/* explicit можно добавить позже отдельным UI */}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Игр в паре (legs)</span>
              <input
                className="input"
                type="number"
                min={1}
                value={gen.legs}
                onChange={(e) =>
                  setGen((s) => ({ ...s, legs: e.target.value }))
                }
              />
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={gen.includeThirdPlace}
                onChange={(e) =>
                  setGen((s) => ({ ...s, includeThirdPlace: e.target.checked }))
                }
              />
              <span>Матч за 3-е место</span>
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={gen.createMatches}
                onChange={(e) =>
                  setGen((s) => ({ ...s, createMatches: e.target.checked }))
                }
              />
              <span>Сразу создать матчи</span>
            </label>
          </div>
          <div className="form__row">
            <label className="field">
              <span className="field__label">Дата для создаваемых матчей</span>
              <input
                className="input"
                type="datetime-local"
                value={gen.startDate}
                onChange={(e) =>
                  setGen((s) => ({ ...s, startDate: e.target.value }))
                }
              />
            </label>
            <label className="field field--checkbox">
              <input
                type="checkbox"
                checked={gen.reset}
                onChange={(e) =>
                  setGen((s) => ({ ...s, reset: e.target.checked }))
                }
              />
              <span>Сначала очистить существующие</span>
            </label>
            <div className="form__actions" style={{ alignSelf: 'flex-end' }}>
              <button
                className="btn btn--primary"
                onClick={generateBracket}
                disabled={loading}
              >
                Сгенерировать
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Раунды</h3>
        <div className="toolbar" style={{ marginBottom: 8 }}>
          <button className="btn" onClick={createRound}>
            + Добавить раунд
          </button>
        </div>
        <div className="table">
          <div className="table__head">
            <div>ID</div>
            <div>Стадия</div>
            <div>Номер</div>
            <div>Дата</div>
            <div>Действия</div>
          </div>
          <div className="table__body">
            {rounds.map((r) => (
              <div className="table__row" key={r.id}>
                <div>#{r.id}</div>
                <div>{r.stage}</div>
                <div>{r.number ?? '—'}</div>
                <div>{r.date ? new Date(r.date).toLocaleString() : '—'}</div>
                <div className="table__actions">
                  <button
                    className="btn btn--sm btn--danger"
                    onClick={() => deleteRound(r.id)}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            ))}
            {rounds.length === 0 && (
              <div className="table__row muted">Нет раундов</div>
            )}
          </div>
        </div>
      </section>

      <section className="card">
        <h3>Пары (ties)</h3>
        {[...groupedTies.entries()].map(([group, list]) => (
          <div key={group} style={{ marginBottom: 12 }}>
            <h4 style={{ margin: '8px 0' }}>{group}</h4>
            <div className="table">
              <div className="table__head">
                <div>ID</div>
                <div>Команда 1</div>
                <div>Команда 2</div>
                <div>Игр (legs)</div>
                <div>Победитель</div>
                <div>Действия</div>
              </div>
              <div className="table__body">
                {list.map((t) => (
                  <div className="table__row" key={t.id}>
                    <div>#{t.id}</div>
                    <div>{t.team1TT?.team?.title || '—'}</div>
                    <div>{t.team2TT?.team?.title || '—'}</div>
                    <div>{t.legs}</div>
                    <div>
                      {t.winnerTTId
                        ? t.team1TT?.id === t.winnerTTId
                          ? t.team1TT?.team?.title
                          : t.team2TT?.team?.title
                        : '—'}
                    </div>
                    <div className="table__actions">
                      <button
                        className="btn btn--sm"
                        onClick={() => recalcTie(t.id)}
                      >
                        Пересчитать
                      </button>
                      <button
                        className="btn btn--sm btn--danger"
                        onClick={async () => {
                          if (!window.confirm('Удалить пару?')) return;
                          const res = await fetch(`${API_TIE}/${t.id}`, {
                            method: 'DELETE',
                          });
                          if (res.ok) await loadAll();
                          else alert('Не удалось удалить пару');
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
                {list.length === 0 && (
                  <div className="table__row muted">Нет пар</div>
                )}
              </div>
            </div>
          </div>
        ))}
        {groupedTies.size === 0 && <div className="muted">Нет пар</div>}
      </section>
    </div>
  );
}
