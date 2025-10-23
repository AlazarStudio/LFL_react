// src/auth/RequireAuth.jsx
import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import serverConfig from '../../serverConfig'; // 'http://localhost:5000/api'

/**
 * Простой guard:
 * - проверяет наличие токена в localStorage ('token')
 * - опционально валидирует на бэке через /auth/me (если verify=true)
 * - проверяет роли (allowRoles)
 */
export default function RequireAuth({
  children,
  allowRoles, // напр. ['admin']
  verify = false, // включите true, если хотите в онлайне проверять токен
}) {
  const location = useLocation();
  const [status, setStatus] = useState(verify ? 'checking' : 'ready');
  const token = localStorage.getItem('token');
  const user = safeParseUser(localStorage.getItem('user')); // { id, email, role } или null

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!verify || !token) {
        setStatus('ready');
        return;
      }
      try {
        const res = await fetch(`${serverConfig}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!cancelled) setStatus(res.ok ? 'ready' : 'fail');
      } catch {
        if (!cancelled) setStatus('fail');
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [verify, token]);

  // Нет токена — на /login
  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Проверка ролей (локально из user, который вы положили после логина)
  if (allowRoles && allowRoles.length) {
    const roleOk = user?.role && allowRoles.includes(user.role);
    if (!roleOk) {
      return <Navigate to="/403" replace />;
    }
  }

  // Ждём валидации токена (если verify=true)
  if (status === 'checking') {
    return <div style={{ padding: 24 }}>Проверка доступа…</div>;
  }
  if (status === 'fail') {
    // Токен невалиден => выкидываем и на /login
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

function safeParseUser(s) {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
