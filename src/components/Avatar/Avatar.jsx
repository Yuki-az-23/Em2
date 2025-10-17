import './Avatar.css';

/**
 * Avatar Component
 * User avatar with emotion ring, status indicator, and fallback initials
 *
 * @param {Object} props - Component props
 * @param {string} [props.src] - Avatar image URL
 * @param {string} [props.alt] - Alt text for image
 * @param {string} [props.name] - User name (for fallback initials)
 * @param {string} [props.emotion] - User's current emotion (for ring color)
 * @param {string} [props.size='md'] - Avatar size (xs, sm, md, lg, xl)
 * @param {string} [props.status] - Status indicator (online, offline, busy, away)
 * @param {boolean} [props.showStatus=false] - Show status indicator
 * @param {Function} [props.onClick] - Click handler
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <Avatar
 *   src={user.avatar_url}
 *   name={user.name}
 *   emotion={user.emotion}
 *   status="online"
 *   showStatus
 *   size="lg"
 * />
 */
export const Avatar = ({
  src,
  alt,
  name,
  emotion,
  size = 'md',
  status,
  showStatus = false,
  onClick,
  className = '',
  ...props
}) => {
  // Generate initials from name
  const getInitials = (name) => {
    if (!name) return '?';
    const parts = name.trim().split(' ');
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  const containerClasses = [
    'avatar',
    `avatar--${size}`,
    emotion && `avatar--emotion-${emotion.toLowerCase()}`,
    onClick && 'avatar--clickable',
    className
  ].filter(Boolean).join(' ');

  return (
    <div
      className={containerClasses}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={alt || name || 'Avatar'}
          className="avatar__image"
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
      ) : null}

      <div
        className="avatar__fallback"
        style={{ display: src ? 'none' : 'flex' }}
      >
        {getInitials(name)}
      </div>

      {showStatus && status && (
        <span className={`avatar__status avatar__status--${status}`} />
      )}
    </div>
  );
};

/**
 * AvatarGroup Component
 * Display multiple avatars in a group with overlap
 *
 * @example
 * <AvatarGroup max={3}>
 *   <Avatar src="..." name="User 1" />
 *   <Avatar src="..." name="User 2" />
 *   <Avatar src="..." name="User 3" />
 * </AvatarGroup>
 */
export const AvatarGroup = ({
  children,
  max = 3,
  size = 'md',
  className = '',
  ...props
}) => {
  const avatars = Array.isArray(children) ? children : [children];
  const displayAvatars = avatars.slice(0, max);
  const remaining = avatars.length - max;

  const groupClasses = [
    'avatar-group',
    `avatar-group--${size}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={groupClasses} {...props}>
      {displayAvatars}
      {remaining > 0 && (
        <div className={`avatar avatar--${size} avatar--overflow`}>
          <div className="avatar__fallback">+{remaining}</div>
        </div>
      )}
    </div>
  );
};

export default Avatar;
