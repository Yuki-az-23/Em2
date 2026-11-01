import { Button } from '../Button/Button.jsx';
import './FollowButton.css';

/**
 * FollowButton Component
 * Follow/Unfollow button for users
 *
 * @param {Object} props - Component props
 * @param {boolean} props.isFollowing - Is currently following this user
 * @param {Function} props.onToggle - Toggle follow handler
 * @param {boolean} [props.loading=false] - Loading state
 * @param {string} [props.emotion] - Emotion theme
 * @param {string} [props.size='md'] - Button size
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <FollowButton
 *   isFollowing={isFollowing}
 *   onToggle={handleToggleFollow}
 *   emotion={user.emotion}
 * />
 */
export const FollowButton = ({
  isFollowing,
  onToggle,
  loading = false,
  emotion,
  size = 'md',
  className = '',
  ...props
}) => {
  const buttonClasses = [
    'follow-button',
    isFollowing && 'follow-button--following',
    className
  ].filter(Boolean).join(' ');

  return (
    <Button
      variant={isFollowing ? 'secondary' : 'primary'}
      emotion={emotion}
      size={size}
      onClick={onToggle}
      loading={loading}
      className={buttonClasses}
      {...props}
    >
      {isFollowing ? (
        <>
          <span className="follow-button__text-default">Following</span>
          <span className="follow-button__text-hover">Unfollow</span>
        </>
      ) : (
        <span className="follow-button__text-default">Follow</span>
      )}
    </Button>
  );
};

export default FollowButton;
