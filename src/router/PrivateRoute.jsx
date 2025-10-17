/**
 * PrivateRoute Component
 *
 * Route wrapper that requires authentication.
 * Redirects to login if user is not authenticated.
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { LoadingOverlay } from '../components';

/**
 * Check if user is authenticated
 * Uses localStorage JWT token
 */
const isAuthenticated = () => {
  const jwt = localStorage.getItem('jwt');
  if (!jwt) return false;

  try {
    // Parse JWT and check expiration
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    const isExpired = payload.exp * 1000 < Date.now();
    return !isExpired;
  } catch (error) {
    return false;
  }
};

/**
 * PrivateRoute Component
 *
 * @param {object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render if authenticated
 * @returns {JSX.Element}
 */
export const PrivateRoute = ({ children }) => {
  const authenticated = isAuthenticated();

  if (!authenticated) {
    // Redirect to login if not authenticated
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default PrivateRoute;
