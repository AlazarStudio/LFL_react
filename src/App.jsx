import React from 'react';
import { Navigate, Route, Routes, BrowserRouter } from 'react-router-dom';
import Layout from './Components/Standart/Layout/Layout';
import HomePage from './Components/Pages/HomePage/HomePage';
import NewsPage from './Components/Pages/NewsPage/NewsPage';
import OneNewsPage from './Components/Pages/OneNewsPage/OneNewsPage';
import MediaPage from './Components/Pages/MediaPage/MediaPage';
import OneMediaPage from './Components/Pages/OneMediaPage/OneMediaPage';
import ParticipantsPage from './Components/Pages/ParticipantsPage/ParticipantsPage';
import Non_Found_Page from './Components/Pages/Non_Found_Page';
import ClubPage from './Components/Pages/ClubPage/ClubPage';
import PlayerStatsPage from './Components/Pages/PlayerStatsPage/PlayerStatsPage';
import CalendarPage from './Components/Pages/CalendarPage/CalendarPage';
import MatchPage from './Components/Pages/MatchPage/MatchPage';
import AdminPage from './Components/Pages/AdminPage/Admin/AdminPage';

import { AuthProvider } from './auth/AuthProvider';
import PrivateRoute from './auth/PrivateRoute';
import LoginPage from './Components/Pages/LoginPage';

function App() {
  return (
    // <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<HomePage />} />
            <Route path="news" element={<NewsPage />} />
            <Route path="news/:id" element={<OneNewsPage />} />
            <Route path="media" element={<MediaPage />} />
            <Route path="media/:id" element={<OneMediaPage />} />
            <Route path="participants">
              <Route index element={<Navigate to="teams" replace />} />
              <Route path="teams" element={<ParticipantsPage />} />
              <Route path="players" element={<ParticipantsPage />} />
              <Route path="referees" element={<ParticipantsPage />} />
            </Route>
            <Route path="/club/:id" element={<ClubPage />} />
            <Route path="/playerStats/:id" element={<PlayerStatsPage />} />
            <Route path="/tournaments" element={<CalendarPage />} />
            <Route path="/match/:matchId" element={<MatchPage />} />
            <Route path="*" element={<Non_Found_Page />} />
          </Route>

          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/admin/*"
            element={
              <PrivateRoute>
                <AdminPage />
              </PrivateRoute>
            }
          />
        </Routes>
      </AuthProvider>
    // </BrowserRouter>
  );
}

export default App;
