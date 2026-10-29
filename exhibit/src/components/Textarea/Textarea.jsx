import { useState, useEffect, useRef } from 'react';
import './Textarea.css';

/**
 * Textarea Component
 * Multi-line text input with auto-resize and character counter
 *
 * @param {Object} props - Component props
 * @param {string} [props.label] - Textarea label
 * @param {string} [props.placeholder] - Placeholder text
 * @param {string} [props.value] - Textarea value
 * @param {Function} [props.onChange] - Change handler
 * @param {Function} [props.onBlur] - Blur handler
 * @param {Function} [props.onFocus] - Focus handler
 * @param {string} [props.error] - Error message
 * @param {string} [props.helperText] - Helper text
 * @param {boolean} [props.disabled=false] - Disabled state
 * @param {boolean} [props.required=false] - Required field
 * @param {string} [props.emotion] - Emotion theme
 * @param {number} [props.rows=3] - Initial rows
 * @param {number} [props.maxLength] - Max character count
 * @param {boolean} [props.showCount=false] - Show character counter
 * @param {boolean} [props.autoResize=true] - Auto-resize height
 * @param {string} [props.resize='none'] - CSS resize property
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <Textarea
 *   label="Post Content"
 *   value={content}
 *   onChange={(e) => setContent(e.target.value)}
 *   maxLength={280}
 *   showCount
 *   autoResize
 *   emotion="Joy"
 * />
 */
export const Textarea = ({
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
  rows = 3,
  maxLength,
  showCount = false,
  autoResize = true,
  resize = 'none',
  className = '',
  ...props
}) => {
  const textareaRef = useRef(null);
  const [charCount, setCharCount] = useState(0);

  // Update character count
  useEffect(() => {
    setCharCount(value?.length || 0);
  }, [value]);

  // Auto-resize functionality
  useEffect(() => {
    if (autoResize && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [value, autoResize]);

  const textareaClasses = [
    'textarea__field',
    error && 'textarea__field--error',
    emotion && `textarea__field--emotion-${emotion.toLowerCase()}`,
    disabled && 'textarea__field--disabled'
  ].filter(Boolean).join(' ');

  const containerClasses = [
    'textarea',
    className
  ].filter(Boolean).join(' ');

  const isOverLimit = maxLength && charCount > maxLength;

  return (
    <div className={containerClasses}>
      {label && (
        <label className="textarea__label">
          {label}
          {required && <span className="textarea__required">*</span>}
        </label>
      )}

      <textarea
        ref={textareaRef}
        className={textareaClasses}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        onFocus={onFocus}
        disabled={disabled}
        required={required}
        rows={rows}
        maxLength={maxLength}
        style={{ resize: autoResize ? 'none' : resize }}
        {...props}
      />

      <div className="textarea__footer">
        {error && <p className="textarea__error">{error}</p>}
        {helperText && !error && <p className="textarea__helper">{helperText}</p>}

        {showCount && (
          <p className={`textarea__count ${isOverLimit ? 'textarea__count--over' : ''}`}>
            {charCount}{maxLength && ` / ${maxLength}`}
          </p>
        )}
      </div>
    </div>
  );
};

export default Textarea;
