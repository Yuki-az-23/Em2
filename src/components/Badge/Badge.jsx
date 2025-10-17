import './Badge.css';

/**
 * Badge Component
 * Small label for counts, status, or categories
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Badge content
 * @param {string} [props.variant='default'] - Badge variant (default, emotion, success, warning, error, info)
 * @param {string} [props.emotion] - Emotion theme
 * @param {string} [props.size='md'] - Badge size (sm, md, lg)
 * @param {boolean} [props.dot=false] - Show as dot indicator
 * @param {boolean} [props.pulse=false] - Pulse animation
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <Badge variant="emotion" emotion="Joy">
 *   3
 * </Badge>
 *
 * <Badge dot pulse variant="error" />
 */
export const Badge = ({
  children,
  variant = 'default',
  emotion,
  size = 'md',
  dot = false,
  pulse = false,
  className = '',
  ...props
}) => {
  const classes = [
    'badge',
    `badge--${variant}`,
    `badge--${size}`,
    emotion && variant === 'emotion' && `badge--emotion-${emotion.toLowerCase()}`,
    dot && 'badge--dot',
    pulse && 'badge--pulse',
    className
  ].filter(Boolean).join(' ');

  if (dot) {
    return <span className={classes} {...props} />;
  }

  return (
    <span className={classes} {...props}>
      {children}
    </span>
  );
};

/**
 * BadgeIcon Component
 * Badge with icon wrapper
 *
 * @example
 * <BadgeIcon count={5}>
 *   <BellIcon />
 * </BadgeIcon>
 */
export const BadgeIcon = ({
  children,
  count,
  max = 99,
  showZero = false,
  dot = false,
  ...badgeProps
}) => {
  const displayCount = count > max ? `${max}+` : count;
  const shouldShow = count > 0 || showZero;

  return (
    <div className="badge-icon">
      {children}
      {shouldShow && (
        <Badge
          {...badgeProps}
          dot={dot}
          className="badge-icon__badge"
        >
          {!dot && displayCount}
        </Badge>
      )}
    </div>
  );
};

export default Badge;
