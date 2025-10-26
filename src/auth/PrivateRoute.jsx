import React, { useContext } from 'react';
import { Navigate } from 'react-router-dom';
import { AuthContext } from './AuthProvider';

export default function PrivateRoute({ children }) {
  const { isAuthenticated, ready } = useContext(AuthContext);
  if (!ready) return null; // или лоадер
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}
