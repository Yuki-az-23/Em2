/**
 * Navigation Component
 *
 * Main navigation bar for the application.
 * Shows on all authenticated pages.
 */

import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Avatar, Button, Badge, Modal } from '../index';
import { useUser, useAuth, usePresence } from '../../hooks';
import './Navigation.css';

/**
 * Navigation Component
 */
export const Navigation = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useUser();
  const { logout } = useAuth();

  // Presence system
  const { onlineUsers, onlineCount, isOnline } = usePresence({
    userId: user?.id,
    userName: user?.name,
    metadata: {
      emotion: user?.emotion,
      color: user?.color,
      photo: user?.photo,
    },
    enabled: !!user,
  });

  // Online users modal
  const [showOnlineUsersModal, setShowOnlineUsersModal] = useState(false);

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
              {/* Online Users Indicator */}
              {onlineCount > 0 && (
                <button
                  className="navigation-online-users"
                  onClick={() => setShowOnlineUsersModal(true)}
                  title={`${onlineCount} user${onlineCount === 1 ? '' : 's'} online`}
                >
                  <span className="navigation-online-users__icon">👥</span>
                  <Badge variant="success" size="sm">
                    {onlineCount}
                  </Badge>
                </button>
              )}

              <Avatar
                name={user.name}
                src={user.photo}
                emotion={user.emotion}
                size="sm"
                onClick={() => navigate('/profile')}
                style={{ cursor: 'pointer' }}
              />
              <span className="navigation-user-name">{user.name}</span>
              {isOnline && (
                <Badge variant="success" size="sm">
                  Online
                </Badge>
              )}
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                Logout
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Online Users Modal */}
      <Modal
        isOpen={showOnlineUsersModal}
        onClose={() => setShowOnlineUsersModal(false)}
        size="md"
      >
        <div className="online-users-modal">
          <h2>Online Now ({onlineCount})</h2>
          <div className="online-users-modal__list">
            {Object.values(onlineUsers).map((onlineUser) => (
              <div
                key={onlineUser.id}
                className="online-users-modal__user"
                onClick={() => {
                  navigate(`/profile/${onlineUser.id}`);
                  setShowOnlineUsersModal(false);
                }}
              >
                <Avatar
                  name={onlineUser.name}
                  src={onlineUser.photo}
                  emotion={onlineUser.emotion}
                  size="md"
                />
                <div className="online-users-modal__user-info">
                  <span className="online-users-modal__user-name">
                    {onlineUser.name}
                  </span>
                  {onlineUser.emotion && (
                    <Badge variant="emotion" emotion={onlineUser.emotion} size="sm">
                      {onlineUser.emotion}
                    </Badge>
                  )}
                </div>
                <Badge variant="success" size="sm">
                  🟢 Online
                </Badge>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </nav>
  );
};

export default Navigation;
