/**
 * Navigation Component
 *
 * Main navigation bar for the application.
 * Shows on all authenticated pages.
 */

import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Avatar, Button } from '../index';
import { useUser, useAuth } from '../../hooks';
import './Navigation.css';

/**
 * Navigation Component
 */
export const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();
  const { logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isActive = (path) => {
    return location.pathname === path || location.pathname.startsWith(path);
  };

  return (
    <nav className="navigation">
      <div className="navigation-container">
        {/* Logo/Brand */}
        <div className="navigation-brand" onClick={() => navigate('/feed')}>
          <h1>EM2</h1>
        </div>

        {/* Nav Links */}
        <div className="navigation-links">
          <button
            className={`navigation-link ${isActive('/feed') ? 'navigation-link--active' : ''}`}
            onClick={() => navigate('/feed')}
          >
            <span className="navigation-link-icon">🏠</span>
            <span className="navigation-link-text">Feed</span>
          </button>

          <button
            className={`navigation-link ${isActive('/post/create') ? 'navigation-link--active' : ''}`}
            onClick={() => navigate('/post/create')}
          >
            <span className="navigation-link-icon">✍️</span>
            <span className="navigation-link-text">Create</span>
          </button>

          <button
            className={`navigation-link ${isActive('/profile') && !location.pathname.includes('/user/') ? 'navigation-link--active' : ''}`}
            onClick={() => navigate('/profile')}
          >
            <span className="navigation-link-icon">👤</span>
            <span className="navigation-link-text">Profile</span>
          </button>
        </div>

        {/* User Menu */}
        <div className="navigation-user">
          {user && (
            <>
              <Avatar
                name={user.name}
                src={user.photo}
                emotion={user.emotion}
                size="sm"
                onClick={() => navigate('/profile')}
                style={{ cursor: 'pointer' }}
              />
              <span className="navigation-user-name">{user.name}</span>
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navigation;
