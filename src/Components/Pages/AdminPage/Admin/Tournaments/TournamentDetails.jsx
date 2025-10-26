import React, { useEffect, useMemo, useState } from 'react';
import {
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import serverConfig from '../../../../../serverConfig';
import uploadsConfig from '../../../../../uploadsConfig';
// import './TournamentDetails.css';

// вкладки
import TournamentOverview from './TournamentOverview';
import TournamentTeamsTab from './tabs/TournamentTeamsTab';
import TournamentRoundsTab from './tabs/TournamentRoundsTab';
import TournamentTiesTab from './tabs/TournamentTiesTab';
import TournamentMatchesTab from './tabs/TournamentMatchesTab';
import BracketTab from './BracketTab';
import TournamentBracketTab from './tabs/TournamentBracketTab';

const API = `${serverConfig}/tournaments`;
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');

export default function TournamentDetails() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const tid = useMemo(() => Number(tournamentId), [tournamentId]);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      // include teams so заголовок может показать кол-во и т.п.
      const res = await fetch(`${API}/${tid}?include=teams,rounds,ties`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setTournament(data);
    } catch (e) {
      console.error(e);
      setErr('Не удалось загрузить турнир');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (Number.isFinite(tid)) load();
  }, [tid]);

  return (
    <div className="league-details">
      <div className="league-details__topbar">
        <button
          className="btn btn--ghost"
          onClick={() => navigate('/admin/tournaments')}
        >
          ← Назад
        </button>
        <h1 className="league-details__title">
          {loading ? 'Загрузка…' : tournament?.title || `Турнир #${tid}`}
        </h1>
      </div>

      {err && <div className="alert alert--error">{err}</div>}

      <nav className="tabs">
        <NavLink end className="tabs__item" to=".">
          Общая
        </NavLink>
        <NavLink className="tabs__item" to="teams">
          Команды
        </NavLink>
        <NavLink className="tabs__item" to="rounds">
          Раунды
        </NavLink>
        <NavLink className="tabs__item" to="ties">
          Пары
        </NavLink>
        <NavLink className="tabs__item" to="matches">
          Матчи
        </NavLink>
        <NavLink className="tabs__item" to="bracket">
          Сетка
        </NavLink>
      </nav>

      <div className="tabs__content">
        <Routes>
          <Route
            index
            element={
              <TournamentOverview
                tournamentId={tid}
                tournament={tournament}
                assetsBase={ASSETS_BASE}
                onReload={load}
              />
            }
          />
          <Route
            path="teams"
            element={<TournamentTeamsTab tournamentId={tid} />}
          />
          <Route
            path="rounds"
            element={<TournamentRoundsTab tournamentId={tid} />}
          />
          <Route
            path="ties"
            element={<TournamentTiesTab tournamentId={tid} />}
          />
          <Route
            path="matches"
            element={<TournamentMatchesTab tournamentId={tid} />}
          />
          <Route path="bracket" element={<TournamentBracketTab />} />
        </Routes>
      </div>
    </div>
  );
}
