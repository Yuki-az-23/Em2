import { Avatar } from '../Avatar/Avatar.jsx';
import { Badge } from '../Badge/Badge.jsx';
import './CommentCard.css';

/**
 * CommentCard Component
 * Display a comment with author, emotion from ECBridge, and replies
 *
 * @param {Object} props - Component props
 * @param {Object} props.comment - Comment data
 * @param {Object} props.comment.author - Author info
 * @param {string} props.comment.text - Comment text
 * @param {string} props.comment.emotion - Comment emotion (from ECBridge)
 * @param {string} props.comment.color - Comment color (from ECBridge)
 * @param {string} props.comment.created_at - Creation timestamp
 * @param {Function} [props.onAuthorClick] - Author click handler
 * @param {Function} [props.onReply] - Reply button handler
 * @param {boolean} [props.isReply=false] - Is this a reply comment
 * @param {React.ReactNode} [props.actions] - Action buttons
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <CommentCard
 *   comment={comment}
 *   onReply={() => setReplyTo(comment.id)}
 *   onAuthorClick={(author) => navigate(`/user/${author.id}`)}
 * />
 */
export const CommentCard = ({
  comment,
  onAuthorClick,
  onReply,
  isReply = false,
  actions,
  className = '',
  ...props
}) => {
  const {
    author,
    text,
    emotion,
    color,
    created_at
  } = comment;

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const seconds = Math.floor((now - time) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return time.toLocaleDateString();
  };

  const handleAuthorClick = () => {
    onAuthorClick?.(author);
  };

  const containerClasses = [
    'comment-card',
    isReply && 'comment-card--reply',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses} {...props}>
      {/* Author */}
      <div
        className="comment-card__author-avatar"
        onClick={handleAuthorClick}
        role={onAuthorClick ? 'button' : undefined}
      >
        <Avatar
          src={author?.avatar_url}
          name={author?.name}
          emotion={author?.emotion}
          size={isReply ? 'sm' : 'md'}
        />
      </div>

      {/* Content */}
      <div className="comment-card__content">
        <div className="comment-card__header">
          <div className="comment-card__meta">
            <span
              className="comment-card__author-name"
              onClick={handleAuthorClick}
              role={onAuthorClick ? 'button' : undefined}
            >
              {author?.name}
            </span>
            <span className="comment-card__timestamp">
              {formatTimeAgo(created_at)}
            </span>
            <Badge variant="emotion" emotion={emotion} size="sm">
              {emotion}
            </Badge>
          </div>
        </div>

        <p className="comment-card__text">{text}</p>

        {/* Actions */}
        <div className="comment-card__actions">
          {onReply && (
            <button
              className="comment-card__action-btn"
              onClick={onReply}
              type="button"
            >
              Reply
            </button>
          )}
          {actions}
        </div>
      </div>
    </div>
  );
};

export default CommentCard;
