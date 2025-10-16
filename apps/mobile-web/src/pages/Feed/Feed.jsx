/**
 * Feed Page
 *
 * Main content stream showing posts from followed users.
 * Posts are filtered and sorted based on user's ECBridge emotion/color.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PostCard,
  LoadingOverlay,
  Spinner,
  Button,
  EmotionPicker,
  ColorPicker,
  Modal,
  ModalFooter,
  Badge
} from '../../components';
import { usePost, useUser, useECBridge, useBrace, useRealtimePosts } from '../../hooks';
import './Feed.css';

/**
 * Feed Page Component
 */
export const Feed = () => {
  const navigate = useNavigate();
  const { user, loading: userLoading } = useUser();
  const { posts: initialPosts, loading: postsLoading, error, refresh } = usePost();
  const { updateECBridge } = useECBridge();
  const { toggleBrace, isBraced } = useBrace();

  // Real-time posts with live updates
  const { posts: livePosts, isSubscribed } = useRealtimePosts({
    initialPosts,
    enabled: !postsLoading && !error,
    onInsert: (newPost) => {
      console.log('New post arrived:', newPost);
      // Optional: Show notification
    },
    onUpdate: (updatedPost) => {
      console.log('Post updated:', updatedPost);
    },
    onDelete: (deletedPost) => {
      console.log('Post deleted:', deletedPost);
    },
  });

  // Use live posts if subscribed, otherwise use initial posts
  const posts = isSubscribed ? livePosts : initialPosts;

  // ECBridge modal state
  const [showECBridgeModal, setShowECBridgeModal] = useState(false);
  const [selectedEmotion, setSelectedEmotion] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [updating, setUpdating] = useState(false);

  // Initialize ECBridge state from user
  useEffect(() => {
    if (user) {
      setSelectedEmotion(user.emotion || 'joy');
      setSelectedColor(user.color || 'yellow');
    }
  }, [user]);

  // Handle ECBridge update
  const handleECBridgeUpdate = async () => {
    setUpdating(true);
    try {
      await updateECBridge(selectedEmotion, selectedColor);
      setShowECBridgeModal(false);
      refresh(); // Refresh feed with new ECBridge settings
    } catch (err) {
      console.error('Failed to update ECBridge:', err);
      alert('Failed to update emotion settings');
    } finally {
      setUpdating(false);
    }
  };

  // Handle post click
  const handlePostClick = (postId) => {
    navigate(`/post/${postId}`);
  };

  // Handle create post
  const handleCreatePost = () => {
    navigate('/post/create');
  };

  // Loading state
  if (userLoading || postsLoading) {
    return <LoadingOverlay />;
  }

  // Error state
  if (error) {
    return (
      <div className="feed-error">
        <h2>Failed to load feed</h2>
        <p>{error}</p>
        <Button onClick={refresh}>Try Again</Button>
      </div>
    );
  }

  // Empty state
  if (!posts || posts.length === 0) {
    return (
      <div className="feed">
        <div className="feed-header">
          <h1>Feed</h1>
          <div className="feed-header__actions">
            <Button
              variant="primary"
              emotion={user?.emotion}
              onClick={handleCreatePost}
            >
              Create Post
            </Button>
            <Button
              variant="outline"
              emotion={user?.emotion}
              onClick={() => setShowECBridgeModal(true)}
            >
              Set Emotion
            </Button>
          </div>
        </div>

        <div className="feed-empty">
          <div className="feed-empty__icon">📭</div>
          <h2>No posts yet</h2>
          <p>Follow users to see their posts in your feed</p>
          <Button variant="primary" onClick={() => navigate('/users')}>
            Discover Users
          </Button>
        </div>

        {/* ECBridge Modal */}
        {renderECBridgeModal()}
      </div>
    );
  }

  // Render ECBridge Modal
  function renderECBridgeModal() {
    return (
      <Modal
        isOpen={showECBridgeModal}
        onClose={() => setShowECBridgeModal(false)}
        size="md"
      >
        <div className="ecbridge-modal">
          <h2>Set Your Emotion Bridge</h2>
          <p className="ecbridge-modal__description">
            Your emotion settings determine how you interact with content and
            what appears in your feed.
          </p>

          <div className="ecbridge-modal__current">
            <Badge variant="emotion" emotion={user?.emotion}>
              Current: {user?.emotion}
            </Badge>
            <Badge variant="default">{user?.color}</Badge>
          </div>

          <div className="ecbridge-modal__pickers">
            <div className="ecbridge-modal__section">
              <label>Select Emotion</label>
              <EmotionPicker
                selected={selectedEmotion}
                onChange={setSelectedEmotion}
                layout="grid"
              />
            </div>

            <div className="ecbridge-modal__section">
              <label>Select Color</label>
              <ColorPicker
                selected={selectedColor}
                onChange={setSelectedColor}
                layout="grid"
              />
            </div>
          </div>

          <ModalFooter>
            <Button
              variant="outline"
              onClick={() => setShowECBridgeModal(false)}
              disabled={updating}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              emotion={selectedEmotion}
              onClick={handleECBridgeUpdate}
              loading={updating}
            >
              Update Emotion Bridge
            </Button>
          </ModalFooter>
        </div>
      </Modal>
    );
  }

  // Main render
  return (
    <div className="feed">
      {/* Feed Header */}
      <div className="feed-header">
        <div className="feed-header__title">
          <h1>Feed</h1>
          {user && (
            <Badge variant="emotion" emotion={user.emotion}>
              {user.emotion}
            </Badge>
          )}
        </div>
        <div className="feed-header__actions">
          <Button
            variant="primary"
            emotion={user?.emotion}
            onClick={handleCreatePost}
          >
            Create Post
          </Button>
          <Button
            variant="outline"
            emotion={user?.emotion}
            onClick={() => setShowECBridgeModal(true)}
          >
            Set Emotion
          </Button>
        </div>
      </div>

      {/* Feed Info */}
      <div className="feed-info">
        <p>
          Showing {posts.length} {posts.length === 1 ? 'post' : 'posts'} based
          on your emotion bridge
        </p>
        {isSubscribed && (
          <Badge variant="success">
            🔴 Live
          </Badge>
        )}
      </div>

      {/* Posts List */}
      <div className="feed-posts">
        {posts.map((post) => (
          <PostCard
            key={post._id}
            author={post.postedBy}
            emotion={post.emotion}
            title={post.title}
            content={post.body}
            braceCount={post.brace?.length || 0}
            commentCount={post.comments?.length || 0}
            timestamp={post.created}
            isBraced={isBraced(post._id)}
            onBrace={() => toggleBrace(post._id)}
            onClick={() => handlePostClick(post._id)}
          />
        ))}
      </div>

      {/* Load More (Future: Infinite Scroll) */}
      {posts.length >= 20 && (
        <div className="feed-load-more">
          <Button variant="outline" onClick={refresh}>
            Load More Posts
          </Button>
        </div>
      )}

      {/* ECBridge Modal */}
      {renderECBridgeModal()}
    </div>
  );
};

export default Feed;
