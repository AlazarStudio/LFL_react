import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminSidebar from '../SideBar/AdminSidebar';
import TeamsPage from '../Teams/AdminTeams';
import './AdminPage.css';
import AdminLeagues from '../Leagues/AdminLeagues';
import LeagueDetails from '../Leagues/LeagueDetails';
import AdminTeamDetails from '../Teams/AdminTeamDetails';
import AdminPlayers from '../Players/AdminPlayers';
import AdminReferees from '../Referees/AdminReaferees';

// ▼ новое
import AdminTournaments from './Tournaments/AdminTournaments';
import TournamentDetails from './Tournaments/TournamentDetails';
import StadiumsTab from '../Stadiums/StadiumsTab';
import NewsTab from '../News/NewsTab';
import PhotosTab from '../Photos/PhotosTab';
import VideosTab from '../Videos/VideosTab';
import LiveMatchMonitor from './Tournaments/LiveMatchMonitor';

export default function AdminPage() {
  return (
    <div className="admin">
      <AdminSidebar />
      <main className="admin__content">
        {/* Глобальные тосты */}
        {/* <ToastPortal /> */}
        <Routes>
          <Route index element={<Navigate to="teams" replace />} />
          <Route path="teams" element={<TeamsPage />} />
          <Route path="leagues" element={<AdminLeagues />} />
          <Route path="leagues/:leagueId/*" element={<LeagueDetails />} />
          <Route path="teams/:id" element={<AdminTeamDetails />} />
          <Route path="players" element={<AdminPlayers />} />
          <Route path="referees" element={<AdminReferees />} />
          <Route path="stadiums" element={<StadiumsTab />} />
          <Route path="news" element={<NewsTab />} />
          <Route path="photos" element={<PhotosTab />} />
          <Route path="videos" element={<VideosTab />} />

          <Route path="tournaments/live" element={<LiveMatchMonitor />} />

          {/* ▼ новое */}
          <Route path="tournaments" element={<AdminTournaments />} />
          <Route
            path="tournaments/:tournamentId/*"
            element={<TournamentDetails />}
          />

          <Route
            path="*"
            element={<div className="admin__empty">Страница не найдена</div>}
          />
        </Routes>
      </main>
    </div>
  );
}
