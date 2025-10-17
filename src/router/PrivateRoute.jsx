/**
 * PrivateRoute Component
 *
 * Route wrapper that requires authentication.
 * Redirects to login if user is not authenticated.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks';
import { LoadingOverlay } from '../components';

/**
 * PrivateRoute Component
 *
 * @param {object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render if authenticated
 * @returns {JSX.Element}
 */
export const PrivateRoute = ({ children }) => {
  const { user, loading, isAuthenticated } = useAuth();

  // Show loading overlay while checking auth status
  if (loading) {
    return <LoadingOverlay />;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default PrivateRoute;
