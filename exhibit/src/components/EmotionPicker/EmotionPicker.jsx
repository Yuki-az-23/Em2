import './EmotionPicker.css';

const EMOTIONS = [
  { name: 'Joy', color: 'yellow', icon: '😊' },
  { name: 'Trust', color: 'lime', icon: '🤝' },
  { name: 'Feared', color: 'green', icon: '😨' },
  { name: 'Surprised', color: 'aqua', icon: '😲' },
  { name: 'Sad', color: 'blue', icon: '😢' },
  { name: 'Disgust', color: 'pink', icon: '🤢' },
  { name: 'Angry', color: 'red', icon: '😠' },
  { name: 'Anticipated', color: 'orange', icon: '🤔' }
];

/**
 * EmotionPicker Component
 * Interactive picker for selecting emotions based on Plutchik's wheel
 *
 * @param {Object} props - Component props
 * @param {string} props.value - Selected emotion
 * @param {Function} props.onChange - Change handler (emotion) => {}
 * @param {string} [props.label] - Label text
 * @param {boolean} [props.showLabel=true] - Show emotion label
 * @param {boolean} [props.showIcon=true] - Show emotion icon
 * @param {string} [props.size='md'] - Size (sm, md, lg)
 * @param {string} [props.layout='grid'] - Layout (grid, list, inline)
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <EmotionPicker
 *   value={emotion}
 *   onChange={setEmotion}
 *   label="How are you feeling?"
 * />
 */
export const EmotionPicker = ({
  value,
  onChange,
  label,
  showLabel = true,
  showIcon = true,
  size = 'md',
  layout = 'grid',
  className = '',
  ...props
}) => {
  const containerClasses = [
    'emotion-picker',
    `emotion-picker--${layout}`,
    className
  ].filter(Boolean).join(' ');

  const handleSelect = (emotionName) => {
    onChange(emotionName);
  };

  return (
    <div className={containerClasses} {...props}>
      {label && <label className="emotion-picker__label">{label}</label>}

      <div className="emotion-picker__options">
        {EMOTIONS.map((emotion) => {
          const isSelected = value === emotion.name;
          const buttonClasses = [
            'emotion-picker__option',
            `emotion-picker__option--${size}`,
            `emotion-picker__option--${emotion.name.toLowerCase()}`,
            isSelected && 'emotion-picker__option--selected'
          ].filter(Boolean).join(' ');

          return (
            <button
              key={emotion.name}
              type="button"
              className={buttonClasses}
              onClick={() => handleSelect(emotion.name)}
              aria-label={emotion.name}
              aria-pressed={isSelected}
            >
              {showIcon && (
                <span className="emotion-picker__icon">{emotion.icon}</span>
              )}
              {showLabel && (
                <span className="emotion-picker__name">{emotion.name}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default EmotionPicker;
