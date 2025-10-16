/**
 * PostDetail Page
 *
 * Displays a single post with full content, comments, and interactions.
 * Includes ContentRenderer for rich text display and comment system.
 */

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ContentRenderer,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  Avatar,
  Badge,
  BraceButton,
  CommentCard,
  Textarea,
  Button,
  LoadingOverlay,
  Spinner,
  FollowButton,
} from '../../components';
import { usePost, useUser, useBrace, useComments, useFollow } from '../../hooks';
import './PostDetail.css';

/**
 * PostDetail Page Component
 */
export const PostDetail = () => {
  const { postId } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const { post, loading, error, deletePost } = usePost(postId);
  const { toggleBrace, isBraced } = useBrace();
  const { comments, addComment, loading: commentsLoading } = useComments(postId);
  const { toggleFollow, isFollowing } = useFollow();

  // Comment form state
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  // Format time ago
  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const seconds = Math.floor((now - time) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    const days = Math.floor(seconds / 86400);
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    if (days < 365) return `${Math.floor(days / 30)}mo ago`;
    return `${Math.floor(days / 365)}y ago`;
  };

  // Calculate reading time
  const getReadingTime = (content) => {
    if (!content) return 1;
    const words = content.split(/\s+/).length;
    return Math.ceil(words / 200); // 200 words per minute
  };

  // Handle comment submit
  const handleCommentSubmit = async () => {
    if (!commentText.trim()) return;

    setSubmittingComment(true);
    try {
      await addComment(postId, commentText.trim());
      setCommentText(''); // Clear input
    } catch (err) {
      console.error('Failed to add comment:', err);
      alert('Failed to post comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Handle delete post
  const handleDeletePost = async () => {
    const confirmDelete = window.confirm(
      'Are you sure you want to delete this post? This action cannot be undone.'
    );
    if (!confirmDelete) return;

    try {
      await deletePost(postId);
      navigate('/feed');
    } catch (err) {
      console.error('Failed to delete post:', err);
      alert('Failed to delete post');
    }
  };

  // Handle edit post
  const handleEditPost = () => {
    navigate(`/post/${postId}/edit`);
  };

  // Loading state
  if (loading) {
    return <LoadingOverlay />;
  }

  // Error state
  if (error || !post) {
    return (
      <div className="post-detail-error">
        <h2>Post Not Found</h2>
        <p>{error || 'This post may have been deleted or does not exist.'}</p>
        <Button onClick={() => navigate('/feed')}>Back to Feed</Button>
      </div>
    );
  }

  // Check if current user is the author
  const isAuthor = user && post.postedBy && user._id === post.postedBy._id;

  return (
    <div className="post-detail">
      {/* Back Button */}
      <div className="post-detail-back">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          ← Back
        </Button>
      </div>

      {/* Post Card */}
      <Card emotion={post.emotion} variant="elevated" className="post-detail-card">
        {/* Post Header */}
        <CardHeader>
          <div className="post-detail-header">
            <div className="post-detail-author">
              <Avatar
                name={post.postedBy?.name}
                src={post.postedBy?.photo}
                emotion={post.postedBy?.emotion}
                status="online"
                size="lg"
                onClick={() => navigate(`/user/${post.postedBy?._id}`)}
              />
              <div className="post-detail-author-info">
                <h3
                  className="post-detail-author-name"
                  onClick={() => navigate(`/user/${post.postedBy?._id}`)}
                >
                  {post.postedBy?.name}
                </h3>
                <div className="post-detail-meta">
                  <span>{formatTimeAgo(post.created)}</span>
                  <span>•</span>
                  <span>{getReadingTime(post.body)} min read</span>
                </div>
              </div>
            </div>

            <div className="post-detail-header-actions">
              {!isAuthor && post.postedBy && (
                <FollowButton
                  isFollowing={isFollowing(post.postedBy._id)}
                  onToggle={() => toggleFollow(post.postedBy._id)}
                  emotion={post.emotion}
                />
              )}
              {isAuthor && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditPost}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeletePost}
                  >
                    Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>

        {/* Post Body */}
        <CardBody>
          <div className="post-detail-content">
            {/* Title */}
            <h1 className="post-detail-title">{post.title}</h1>

            {/* Emotion Badge */}
            <div className="post-detail-badges">
              <Badge variant="emotion" emotion={post.emotion}>
                {post.emotion}
              </Badge>
              <Badge variant="default">{post.color}</Badge>
              {post.emotion !== post.initialEmotion && (
                <Badge variant="default">
                  Originally: {post.initialEmotion}
                </Badge>
              )}
            </div>

            {/* Rich Content */}
            <div className="post-detail-body">
              {post.content ? (
                <ContentRenderer data={post.content} emotion={post.emotion} />
              ) : (
                <p>{post.body}</p>
              )}
            </div>
          </div>
        </CardBody>

        {/* Post Actions */}
        <CardFooter>
          <div className="post-detail-actions">
            <BraceButton
              count={post.brace?.length || 0}
              isBraced={isBraced(post._id)}
              onToggle={() => toggleBrace(post._id)}
              emotion={post.emotion}
            />
            <div className="post-detail-comment-count">
              💬 {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* Comments Section */}
      <div className="post-detail-comments">
        <h2>Comments ({comments.length})</h2>

        {/* Add Comment Form */}
        {user && (
          <Card variant="flat" className="post-detail-comment-form">
            <CardBody>
              <div className="post-detail-comment-form-header">
                <Avatar
                  name={user.name}
                  src={user.photo}
                  emotion={user.emotion}
                  size="md"
                />
                <h4>Add a Comment</h4>
              </div>

              <Textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Share your thoughts..."
                maxLength={500}
                autoResize
                emotion={post.emotion}
              />

              <div className="post-detail-comment-form-actions">
                <Button
                  variant="outline"
                  onClick={() => setCommentText('')}
                  disabled={!commentText || submittingComment}
                >
                  Clear
                </Button>
                <Button
                  variant="primary"
                  emotion={post.emotion}
                  onClick={handleCommentSubmit}
                  loading={submittingComment}
                  disabled={!commentText.trim()}
                >
                  Post Comment
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* Comments List */}
        {commentsLoading ? (
          <div className="post-detail-comments-loading">
            <Spinner />
            <p>Loading comments...</p>
          </div>
        ) : comments.length > 0 ? (
          <div className="post-detail-comments-list">
            {comments.map((comment) => (
              <CommentCard
                key={comment._id}
                author={comment.postedBy}
                emotion={comment.emotion}
                content={comment.text}
                timestamp={comment.created}
                onReply={() => {
                  setCommentText(`@${comment.postedBy?.name} `);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="post-detail-comments-empty">
            <p>No comments yet. Be the first to share your thoughts!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PostDetail;
