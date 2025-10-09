import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../Components/AuthContext';

const ProtectedRoute = ({ children }) => {
  const { checkAuth } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(null);

  useEffect(() => {
    const checkAuthorization = async () => {
      try {
        console.log('Checking authorization...');
        await checkAuth();
        setIsAuthenticated(true);
      } catch (error) {
        console.error('Authorization failed:', error);
        setIsAuthenticated(false);
      }
    };

    checkAuthorization();
  }, [checkAuth]);

  if (isAuthenticated === null) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
