import './Card.css';

/**
 * Card Component
 * Versatile container with emotion theming
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Card content
 * @param {string} [props.emotion] - Emotion theme
 * @param {string} [props.variant='default'] - Card variant (default, outlined, elevated)
 * @param {boolean} [props.hoverable=false] - Add hover effect
 * @param {boolean} [props.clickable=false] - Add click cursor
 * @param {Function} [props.onClick] - Click handler
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <Card emotion="Joy" hoverable>
 *   <h3>Card Title</h3>
 *   <p>Card content</p>
 * </Card>
 */
export const Card = ({
  children,
  emotion,
  variant = 'default',
  hoverable = false,
  clickable = false,
  onClick,
  className = '',
  ...props
}) => {
  const classes = [
    'card',
    `card--${variant}`,
    emotion && `card--emotion-${emotion.toLowerCase()}`,
    hoverable && 'card--hoverable',
    clickable && 'card--clickable',
    className
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      {...props}
    >
      {children}
    </div>
  );
};

/**
 * CardHeader Component
 */
export const CardHeader = ({ children, className = '', ...props }) => (
  <div className={`card__header ${className}`} {...props}>
    {children}
  </div>
);

/**
 * CardBody Component
 */
export const CardBody = ({ children, className = '', ...props }) => (
  <div className={`card__body ${className}`} {...props}>
    {children}
  </div>
);

/**
 * CardFooter Component
 */
export const CardFooter = ({ children, className = '', ...props }) => (
  <div className={`card__footer ${className}`} {...props}>
    {children}
  </div>
);

export default Card;
