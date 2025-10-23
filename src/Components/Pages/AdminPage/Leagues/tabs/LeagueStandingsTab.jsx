import React, { useEffect, useState } from 'react';
import serverConfig from '../../../../../serverConfig';
import './LeagueStandingsTab.css';

const API = `${serverConfig}/leagueStandings`;

export default function LeagueStandingsTab({ leagueId }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr('');
    try {
      setLoading(true);
      const params = new URLSearchParams({
        range: JSON.stringify([0, 999]),
        sort: JSON.stringify(['points', 'DESC']),
        filter: JSON.stringify({ league_id: leagueId }),
      });
      const res = await fetch(`${API}?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setErr('Не удалось загрузить таблицу');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId]);

  return (
    <section className="card">
      <h3>Турнирная таблица</h3>
      {err && <div className="alert alert--error">{err}</div>}
      {loading && <div className="alert">Загрузка…</div>}

      <div className="standings">
        <div className="standings__grid standings__head">
          <div className="c-rank num">#</div>
          <div className="c-team">Команда</div>
          <div className="c-n num" title="Игры">
            И
          </div>
          <div className="c-n num" title="Победы">
            В
          </div>
          <div className="c-n num" title="Ничьи">
            Н
          </div>
          <div className="c-n num" title="Поражения">
            П
          </div>
          <div className="c-n num" title="Забитые">
            Заб
          </div>
          <div className="c-n num" title="Пропущенные">
            Проп
          </div>
          <div className="c-pts num" title="Очки">
            О
          </div>
        </div>

        <div className="standings__body">
          {rows.length === 0 && !loading && (
            <div className="standings__empty muted">Нет данных</div>
          )}

          {rows.map((r, i) => (
            <div
              className="standings__grid standings__row"
              key={r.id ?? r.team_id ?? i}
            >
              <div className="c-rank num">{i + 1}</div>
              <div className="c-team">
                {r.team?.title || r.team_title || r.team_id}
              </div>
              <div className="c-n num">{r.played ?? 0}</div>
              <div className="c-n num">{r.wins ?? 0}</div>
              <div className="c-n num">{r.draws ?? 0}</div>
              <div className="c-n num">{r.losses ?? 0}</div>
              <div className="c-n num">{r.goals_for ?? 0}</div>
              <div className="c-n num">{r.goals_against ?? 0}</div>
              <div className="c-pts num cell-strong">{r.points ?? 0}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
