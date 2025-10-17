import './Spinner.css';

/**
 * Spinner Component
 * Loading indicator with multiple variants
 *
 * @param {Object} props - Component props
 * @param {string} [props.size='md'] - Spinner size (xs, sm, md, lg, xl)
 * @param {string} [props.variant='circle'] - Spinner variant (circle, dots, pulse)
 * @param {string} [props.emotion] - Emotion theme color
 * @param {string} [props.label] - Accessible label text
 * @param {boolean} [props.center=false] - Center in container
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <Spinner size="lg" emotion="Joy" label="Loading posts..." />
 */
export const Spinner = ({
  size = 'md',
  variant = 'circle',
  emotion,
  label,
  center = false,
  className = '',
  ...props
}) => {
  const containerClasses = [
    'spinner',
    center && 'spinner--center',
    className
  ].filter(Boolean).join(' ');

  const spinnerClasses = [
    `spinner__${variant}`,
    `spinner--${size}`,
    emotion && `spinner--emotion-${emotion.toLowerCase()}`
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses} role="status" aria-label={label || 'Loading'} {...props}>
      {variant === 'circle' && (
        <svg className={spinnerClasses} viewBox="0 0 50 50">
          <circle
            className="spinner__path"
            cx="25"
            cy="25"
            r="20"
            fill="none"
            strokeWidth="4"
          />
        </svg>
      )}

      {variant === 'dots' && (
        <div className={spinnerClasses}>
          <span className="spinner__dot" />
          <span className="spinner__dot" />
          <span className="spinner__dot" />
        </div>
      )}

      {variant === 'pulse' && (
        <div className={spinnerClasses}>
          <span className="spinner__pulse" />
        </div>
      )}

      {label && <span className="spinner__label">{label}</span>}
    </div>
  );
};

/**
 * LoadingOverlay Component
 * Full-screen loading overlay
 *
 * @example
 * <LoadingOverlay isLoading={loading} label="Loading your feed..." />
 */
export const LoadingOverlay = ({
  isLoading,
  label,
  emotion,
  ...props
}) => {
  if (!isLoading) return null;

  return (
    <div className="loading-overlay">
      <Spinner size="xl" emotion={emotion} label={label} {...props} />
    </div>
  );
};

export default Spinner;
