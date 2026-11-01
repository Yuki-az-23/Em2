import { Button } from '../Button/Button.jsx';
import './BraceButton.css';

/**
 * BraceButton Component
 * Like button for posts (called "Brace" in EM2)
 *
 * @param {Object} props - Component props
 * @param {boolean} props.braced - Is post braced by current user
 * @param {number} [props.count=0] - Number of braces
 * @param {Function} props.onToggle - Toggle brace handler
 * @param {boolean} [props.loading=false] - Loading state
 * @param {string} [props.emotion] - Emotion theme
 * @param {string} [props.size='md'] - Button size
 * @param {boolean} [props.showCount=true] - Show brace count
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <BraceButton
 *   braced={braced}
 *   count={braceCount}
 *   onToggle={handleToggleBrace}
 *   emotion="Joy"
 * />
 */
export const BraceButton = ({
  braced,
  count = 0,
  onToggle,
  loading = false,
  emotion,
  size = 'md',
  showCount = true,
  className = '',
  ...props
}) => {
  const buttonClasses = [
    'brace-button',
    braced && 'brace-button--braced',
    className
  ].filter(Boolean).join(' ');

  return (
    <Button
      variant={braced ? 'primary' : 'outline'}
      emotion={emotion}
      size={size}
      onClick={onToggle}
      loading={loading}
      className={buttonClasses}
      {...props}
    >
      <span className="brace-button__icon" aria-hidden="true">
        {braced ? '🤝' : '🫱'}
      </span>
      {showCount && (
        <span className="brace-button__count">
          {count > 0 ? count : 'Brace'}
        </span>
      )}
    </Button>
  );
};

export default BraceButton;
