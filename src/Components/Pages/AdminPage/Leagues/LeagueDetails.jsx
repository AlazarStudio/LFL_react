import React, { useEffect, useState, useMemo } from 'react';
import {
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from 'react-router-dom';
import serverConfig from '../../../../serverConfig';
import uploadsConfig from '../../../../uploadsConfig';
import LeagueOverview from './LeagueOverview';
import LeagueTeamsTab from './tabs/LeagueTeamsTab';
import LeagueMatchesTab from './tabs/LeagueMatchesTab';
import LeagueStandingsTab from './tabs/LeagueStandingsTab';
import LeagueExportTab from './tabs/LeagueExportTab';
import './LeagueDetails.css';

const API = `${serverConfig}/leagues`;
const ASSETS_BASE = String(uploadsConfig || '').replace(/\/api\/?$/, '');

export default function LeagueDetails() {
  const { leagueId } = useParams();
  const navigate = useNavigate();
  const [league, setLeague] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const lid = useMemo(() => Number(leagueId), [leagueId]);

  async function load() {
    setLoading(true);
    setErr('');
    try {
      const res = await fetch(`${API}/${lid}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setLeague(data);
    } catch (e) {
      console.error(e);
      setErr('Не удалось загрузить лигу');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (Number.isFinite(lid)) load();
  }, [lid]);

  return (
    <div className="league-details">
      <div className="league-details__topbar">
        <button
          className="btn btn--ghost"
          onClick={() => navigate('/admin/leagues')}
        >
          ← Назад
        </button>
        <h1 className="league-details__title">
          {loading ? 'Загрузка…' : league?.title || `Лига #${lid}`}
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
        <NavLink className="tabs__item" to="matches">
          Матчи
        </NavLink>
        <NavLink className="tabs__item" to="standings">
          Турнирная таблица
        </NavLink>
        <NavLink className="tabs__item" to="export">
          Экспорт
        </NavLink>
      </nav>

      <div className="tabs__content">
        <Routes>
          <Route
            index
            element={
              <LeagueOverview
                leagueId={lid}
                league={league}
                assetsBase={ASSETS_BASE}
                onReload={load}
              />
            }
          />
          <Route path="teams" element={<LeagueTeamsTab leagueId={lid} />} />
          <Route path="matches" element={<LeagueMatchesTab leagueId={lid} />} />
          <Route
            path="standings"
            element={<LeagueStandingsTab leagueId={lid} />}
          />
          <Route path="export" element={<LeagueExportTab leagueId={lid} />} />
        </Routes>
      </div>
    </div>
  );
}
