/**
 * Profile Page
 *
 * Displays user profile with posts, followers, and following.
 * Shows user's emotion/color bridge and post history.
 */

import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  PostCard,
  LoadingOverlay,
  FollowButton,
  Modal,
} from '../../components';
import { useUser, usePost, useFollow, useRealtimeFollows } from '../../hooks';
import './Profile.css';

/**
 * Profile Page Component
 */
export const Profile = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useUser();
  const { user: profileUser, loading: userLoading } = useUser(userId);
  const { posts, loading: postsLoading } = usePost({ userId });
  const { toggleFollow, isFollowing: checkIsFollowing, followers, following } = useFollow();

  // Real-time follows with live counts
  const {
    followersCount: liveFollowersCount,
    followingCount: liveFollowingCount,
    isFollowing,
    isSubscribed: followsSubscribed,
  } = useRealtimeFollows({
    userId,
    initialFollowersCount: profileUser?.followers?.length || 0,
    initialFollowingCount: profileUser?.following?.length || 0,
    initialIsFollowing: checkIsFollowing(userId),
    currentUserId: currentUser?.id,
    enabled: !!profileUser && !userLoading,
  });

  // Use live counts if subscribed, otherwise use initial counts
  const followersCount = followsSubscribed ? liveFollowersCount : (profileUser?.followers?.length || 0);
  const followingCount = followsSubscribed ? liveFollowingCount : (profileUser?.following?.length || 0);

  // Modal state
  const [showFollowersModal, setShowFollowersModal] = useState(false);
  const [showFollowingModal, setShowFollowingModal] = useState(false);

  // Check if viewing own profile
  const isOwnProfile = currentUser && profileUser && currentUser._id === profileUser._id;

  // Loading state
  if (userLoading || postsLoading) {
    return <LoadingOverlay />;
  }

  // Error state
  if (!profileUser) {
    return (
      <div className="profile-error">
        <h2>User Not Found</h2>
        <p>This user may not exist or has been deleted.</p>
        <Button onClick={() => navigate('/feed')}>Back to Feed</Button>
      </div>
    );
  }

  return (
    <div className="profile">
      {/* Profile Header */}
      <Card variant="elevated" className="profile-header-card">
        <CardBody>
          <div className="profile-header">
            {/* Avatar & Basic Info */}
            <div className="profile-header-main">
              <Avatar
                name={profileUser.name}
                src={profileUser.photo}
                emotion={profileUser.emotion}
                status="online"
                size="xl"
              />

              <div className="profile-header-info">
                <h1>{profileUser.name}</h1>
                <p className="profile-header-email">{profileUser.email}</p>

                {/* Emotion Bridge */}
                <div className="profile-header-bridge">
                  <Badge variant="emotion" emotion={profileUser.emotion}>
                    {profileUser.emotion}
                  </Badge>
                  <Badge variant="default">{profileUser.color}</Badge>
                </div>

                {/* Stats */}
                <div className="profile-header-stats">
                  <button
                    className="profile-stat"
                    onClick={() => setShowFollowersModal(true)}
                  >
                    <strong>{profileUser.followers?.length || 0}</strong>
                    <span>Followers</span>
                  </button>
                  <button
                    className="profile-stat"
                    onClick={() => setShowFollowingModal(true)}
                  >
                    <strong>{profileUser.following?.length || 0}</strong>
                    <span>Following</span>
                  </button>
                  <div className="profile-stat">
                    <strong>{posts.length}</strong>
                    <span>Posts</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="profile-header-actions">
              {isOwnProfile ? (
                <Button
                  variant="primary"
                  emotion={profileUser.emotion}
                  onClick={() => navigate('/profile/edit')}
                >
                  Edit Profile
                </Button>
              ) : (
                <FollowButton
                  isFollowing={isFollowing(profileUser._id)}
                  onToggle={() => toggleFollow(profileUser._id)}
                  emotion={profileUser.emotion}
                />
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Posts Section */}
      <div className="profile-posts">
        <h2>
          {isOwnProfile ? 'Your Posts' : `${profileUser.name}'s Posts`}
          {posts.length > 0 && <span> ({posts.length})</span>}
        </h2>

        {posts.length > 0 ? (
          <div className="profile-posts-grid">
            {posts.map((post) => (
              <PostCard
                key={post._id}
                author={profileUser}
                emotion={post.emotion}
                title={post.title}
                content={post.body}
                braceCount={post.brace?.length || 0}
                commentCount={post.comments?.length || 0}
                timestamp={post.created}
                onClick={() => navigate(`/post/${post._id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="profile-posts-empty">
            <div className="profile-posts-empty-icon">📝</div>
            <h3>No posts yet</h3>
            <p>
              {isOwnProfile
                ? 'Share your first post with the community!'
                : `${profileUser.name} hasn't posted anything yet.`}
            </p>
            {isOwnProfile && (
              <Button
                variant="primary"
                emotion={profileUser.emotion}
                onClick={() => navigate('/post/create')}
              >
                Create Your First Post
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Followers Modal */}
      <Modal
        isOpen={showFollowersModal}
        onClose={() => setShowFollowersModal(false)}
        size="md"
      >
        <div className="profile-modal">
          <h2>Followers</h2>
          {followers && followers.length > 0 ? (
            <div className="profile-modal-list">
              {followers.map((follower) => (
                <div
                  key={follower._id}
                  className="profile-modal-item"
                  onClick={() => {
                    setShowFollowersModal(false);
                    navigate(`/user/${follower._id}`);
                  }}
                >
                  <Avatar
                    name={follower.name}
                    src={follower.photo}
                    emotion={follower.emotion}
                    size="md"
                  />
                  <div className="profile-modal-item-info">
                    <h4>{follower.name}</h4>
                    <Badge variant="emotion" emotion={follower.emotion}>
                      {follower.emotion}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="profile-modal-empty">No followers yet</p>
          )}
        </div>
      </Modal>

      {/* Following Modal */}
      <Modal
        isOpen={showFollowingModal}
        onClose={() => setShowFollowingModal(false)}
        size="md"
      >
        <div className="profile-modal">
          <h2>Following</h2>
          {following && following.length > 0 ? (
            <div className="profile-modal-list">
              {following.map((followed) => (
                <div
                  key={followed._id}
                  className="profile-modal-item"
                  onClick={() => {
                    setShowFollowingModal(false);
                    navigate(`/user/${followed._id}`);
                  }}
                >
                  <Avatar
                    name={followed.name}
                    src={followed.photo}
                    emotion={followed.emotion}
                    size="md"
                  />
                  <div className="profile-modal-item-info">
                    <h4>{followed.name}</h4>
                    <Badge variant="emotion" emotion={followed.emotion}>
                      {followed.emotion}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="profile-modal-empty">Not following anyone yet</p>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Profile;
