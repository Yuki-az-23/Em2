/**
 * Feed Page
 *
 * Main content stream showing posts from followed users.
 * Posts are filtered and sorted based on user's ECBridge emotion/color.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, CardBody, Badge } from '../../components';
import { useAuth } from '../../hooks';
import './Feed.css';

/**
 * Feed Page Component
 */
export const Feed = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="feed">
      <div className="feed-container">
        {/* Header */}
        <div className="feed-header">
          <h1>Welcome to EM2!</h1>
          <p>Your emotional social network</p>
        </div>

        {/* User Info Card */}
        {user && (
          <Card variant="elevated" className="feed-welcome-card">
            <CardBody>
              <h2>Hello, {user.user_metadata?.name || user.email}!</h2>
              <p>You're successfully logged in.</p>

              {/* User's Emotion Bridge */}
              {user.user_metadata?.emotion && user.user_metadata?.color && (
                <div className="feed-user-bridge">
                  <h3>Your Emotion Bridge:</h3>
                  <div className="feed-badges">
                    <Badge variant="emotion" emotion={user.user_metadata.emotion}>
                      {user.user_metadata.emotion}
                    </Badge>
                    <Badge variant="default">{user.user_metadata.color}</Badge>
                  </div>
                </div>
              )}

              {/* User Info */}
              <div className="feed-user-info">
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>User ID:</strong> {user.id.substring(0, 8)}...</p>
                <p><strong>Joined:</strong> {new Date(user.created_at).toLocaleDateString()}</p>
              </div>

              {/* Actions */}
              <div className="feed-actions">
                <Button
                  variant="outline"
                  onClick={() => navigate('/profile')}
                >
                  View Profile
                </Button>
                <Button
                  variant="outline"
                  emotion="angry"
                  onClick={handleLogout}
                >
                  Logout
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Coming Soon Section */}
        <Card variant="outline" className="feed-coming-soon">
          <CardBody>
            <h3>Coming Soon</h3>
            <ul>
              <li>📝 Create and view posts (repeats)</li>
              <li>💬 Comment on posts with ECBridge emotions</li>
              <li>❤️ Brace (like) posts</li>
              <li>👥 Follow other users</li>
              <li>🌈 ECBridge feed filtering</li>
              <li>⚡ Real-time updates</li>
            </ul>
          </CardBody>
        </Card>

        {/* Navigation Info */}
        <Card variant="outline" className="feed-nav-info">
          <CardBody>
            <h3>Navigation</h3>
            <p>The navigation system is set up with the following routes:</p>
            <ul>
              <li><code>/feed</code> - This page (Feed)</li>
              <li><code>/post/create</code> - Create a new post</li>
              <li><code>/profile</code> - Your profile</li>
              <li><code>/profile/edit</code> - Edit your profile</li>
            </ul>
            <p className="feed-note">
              <strong>Note:</strong> These pages exist but their functionality is still being implemented.
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default Feed;
