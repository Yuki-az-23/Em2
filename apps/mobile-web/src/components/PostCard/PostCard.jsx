import { Card } from '../Card/Card.jsx';
import { Avatar } from '../Avatar/Avatar.jsx';
import { Badge } from '../Badge/Badge.jsx';
import { share, haptics } from '../../services/native';
import './PostCard.css';

/**
 * PostCard Component
 * Display a post with author info, emotion, and interaction stats
 *
 * @param {Object} props - Component props
 * @param {Object} props.post - Post data
 * @param {Object} props.post.author - Author info
 * @param {string} props.post.title - Post title
 * @param {string} props.post.emotion - Post emotion
 * @param {string} props.post.color - Post color
 * @param {number} props.post.brace_count - Number of braces (likes)
 * @param {number} props.post.comment_count - Number of comments
 * @param {string} props.post.created_at - Creation timestamp
 * @param {Function} [props.onAuthorClick] - Author click handler
 * @param {Function} [props.onClick] - Post click handler
 * @param {React.ReactNode} [props.actions] - Action buttons
 * @param {boolean} [props.showActions=true] - Show action buttons
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <PostCard
 *   post={post}
 *   onClick={() => navigate(`/post/${post.id}`)}
 *   actions={<>
 *     <BraceButton postId={post.id} />
 *     <CommentButton count={post.comment_count} />
 *   </>}
 * />
 */
export const PostCard = ({
  post,
  onAuthorClick,
  onClick,
  actions,
  showActions = true,
  className = '',
  ...props
}) => {
  const {
    author,
    title,
    emotion,
    color,
    brace_count = 0,
    comment_count = 0,
    created_at,
    content
  } = post;

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const seconds = Math.floor((now - time) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return time.toLocaleDateString();
  };

  const handleAuthorClick = (e) => {
    e.stopPropagation();
    onAuthorClick?.(author);
  };

  return (
    <Card
      emotion={emotion}
      variant="outlined"
      hoverable
      clickable={!!onClick}
      onClick={onClick}
      className={`post-card ${className}`}
      {...props}
    >
      {/* Header */}
      <div className="post-card__header">
        <div
          className="post-card__author"
          onClick={handleAuthorClick}
          role={onAuthorClick ? 'button' : undefined}
        >
          <Avatar
            src={author?.avatar_url}
            name={author?.name}
            emotion={author?.emotion}
            size="md"
          />
          <div className="post-card__author-info">
            <span className="post-card__author-name">{author?.name}</span>
            <span className="post-card__timestamp">{formatTimeAgo(created_at)}</span>
          </div>
        </div>

        <Badge variant="emotion" emotion={emotion} size="sm">
          {emotion}
        </Badge>
      </div>

      {/* Content */}
      <div className="post-card__content">
        <h3 className="post-card__title">{title}</h3>
        {content && (
          <div className="post-card__body">
            {typeof content === 'string' ? content : JSON.stringify(content)}
          </div>
        )}
      </div>

      {/* Footer */}
      {showActions && (
        <div className="post-card__footer">
          <div className="post-card__stats">
            <span className="post-card__stat">
              <span className="post-card__stat-icon">🤝</span>
              {brace_count}
            </span>
            <span className="post-card__stat">
              <span className="post-card__stat-icon">💬</span>
              {comment_count}
            </span>
            {share.isShareAvailable() && (
              <button
                className="post-card__share"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await share.sharePost({ id: post.id, title, emotion });
                    haptics.notifySuccess();
                  } catch (error) {
                    console.error('Share failed:', error);
                  }
                }}
                title="Share post"
              >
                <span className="post-card__stat-icon">📤</span>
                Share
              </button>
            )}
          </div>

          {actions && (
            <div className="post-card__actions">
              {actions}
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

export default PostCard;
