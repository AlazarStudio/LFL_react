import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './AdminSidebar.css';

export default function AdminSidebar() {
  const navigate = useNavigate();
  return (
    <aside className="sidebar">
      <div className="sidebar__logo">
        <img src="/images/logoLFL.svg" onClick={() => navigate('/')} />
      </div>
      <nav className="sidebar__nav">
        <NavLink
          to="/admin/leagues"
          className={({ isActive }) =>
            `sidebar__link ${isActive ? 'is-active' : ''}`
          }
        >
          Лиги
        </NavLink>
        <NavLink
          to="/admin/tournaments"
          className={({ isActive }) =>
            `sidebar__link ${isActive ? 'is-active' : ''}`
          }
        >
          Турниры
        </NavLink>
        <NavLink
          to="/admin/teams"
          className={({ isActive }) =>
            `sidebar__link ${isActive ? 'is-active' : ''}`
          }
        >
          Команды
        </NavLink>
        <NavLink
          to="/admin/players"
          className={({ isActive }) =>
            `sidebar__link ${isActive ? 'is-active' : ''}`
          }
        >
          Игроки
        </NavLink>
        <NavLink
          to="/admin/referees"
          className={({ isActive }) =>
            `sidebar__link ${isActive ? 'is-active' : ''}`
          }
        >
          Судьи
        </NavLink>
        <NavLink
          to="/admin/stadiums"
          className={({ isActive }) =>
            `sidebar__link ${isActive ? 'is-active' : ''}`
          }
        >
          Стадионы
        </NavLink>
        <NavLink
          to="/admin/news"
          className={({ isActive }) =>
            `sidebar__link ${isActive ? 'is-active' : ''}`
          }
        >
          Новости
        </NavLink>
        <NavLink
          to="/admin/videos"
          className={({ isActive }) =>
            `sidebar__link ${isActive ? 'is-active' : ''}`
          }
        >
          Видео
        </NavLink>
        <NavLink
          to="/admin/photos"
          className={({ isActive }) =>
            `sidebar__link ${isActive ? 'is-active' : ''}`
          }
        >
          Фото
        </NavLink>
        <NavLink to="/admin/tournaments/live">Live монитор</NavLink>
      </nav>
      <div className="sidebar__footer">v1.0</div>
    </aside>
  );
}
