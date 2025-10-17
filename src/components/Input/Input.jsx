import './Input.css';

/**
 * Input Component
 * Styled input field with label, error, and helper text
 *
 * @param {Object} props - Component props
 * @param {string} [props.type='text'] - Input type
 * @param {string} [props.label] - Input label
 * @param {string} [props.placeholder] - Placeholder text
 * @param {string} [props.value] - Input value
 * @param {Function} [props.onChange] - Change handler
 * @param {Function} [props.onBlur] - Blur handler
 * @param {Function} [props.onFocus] - Focus handler
 * @param {string} [props.error] - Error message
 * @param {string} [props.helperText] - Helper text
 * @param {boolean} [props.disabled=false] - Disabled state
 * @param {boolean} [props.required=false] - Required field
 * @param {string} [props.emotion] - Emotion theme
 * @param {string} [props.size='md'] - Input size (sm, md, lg)
 * @param {React.ReactNode} [props.icon] - Icon element
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <Input
 *   label="Email"
 *   type="email"
 *   value={email}
 *   onChange={(e) => setEmail(e.target.value)}
 *   error={errors.email}
 *   required
 * />
 */
export const Input = ({
  type = 'text',
  label,
  placeholder,
  value,
  onChange,
  onBlur,
  onFocus,
  error,
  helperText,
  disabled = false,
  required = false,
  emotion,
  size = 'md',
  icon,
  className = '',
  ...props
}) => {
  const inputClasses = [
    'input__field',
    `input__field--${size}`,
    error && 'input__field--error',
    emotion && `input__field--emotion-${emotion.toLowerCase()}`,
    icon && 'input__field--with-icon',
    disabled && 'input__field--disabled'
  ].filter(Boolean).join(' ');

  const containerClasses = [
    'input',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={containerClasses}>
      {label && (
        <label className="input__label">
          {label}
          {required && <span className="input__required">*</span>}
        </label>
      )}

      <div className="input__wrapper">
        {icon && <span className="input__icon">{icon}</span>}

        <input
          type={type}
          className={inputClasses}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          onFocus={onFocus}
          disabled={disabled}
          required={required}
          {...props}
        />
      </div>

      {error && <p className="input__error">{error}</p>}
      {helperText && !error && <p className="input__helper">{helperText}</p>}
    </div>
  );
};

export default Input;
