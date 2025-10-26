import React, { createContext, useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { useNavigate } from 'react-router-dom';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  // читаем синхронно и сразу, чтобы не было мигания
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => !!Cookies.get('token')
  );
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // на случай, если куку поставили/удалили с другого экрана
    setIsAuthenticated(!!Cookies.get('token'));
    setReady(true);
  }, []);

  const login = (token) => {
    Cookies.set('token', token, { expires: 10, path: '/' }); // ВАЖНО: path:'/'
    setIsAuthenticated(true);
  };

  const logout = () => {
    Cookies.remove('token', { path: '/' }); // ВАЖНО: тот же path
    setIsAuthenticated(false);
    navigate('/login', { replace: true });
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, ready, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
