import './ColorPicker.css';

const COLORS = [
  { name: 'yellow', hex: '#FFD700', label: 'Yellow' },
  { name: 'lime', hex: '#7FFF00', label: 'Lime' },
  { name: 'green', hex: '#228B22', label: 'Green' },
  { name: 'aqua', hex: '#00CED1', label: 'Aqua' },
  { name: 'blue', hex: '#4169E1', label: 'Blue' },
  { name: 'pink', hex: '#FF69B4', label: 'Pink' },
  { name: 'red', hex: '#DC143C', label: 'Red' },
  { name: 'orange', hex: '#FF8C00', label: 'Orange' }
];

/**
 * ColorPicker Component
 * Interactive color picker for ECBridge colors
 *
 * @param {Object} props - Component props
 * @param {string} props.value - Selected color name
 * @param {Function} props.onChange - Change handler (color) => {}
 * @param {string} [props.label] - Label text
 * @param {boolean} [props.showLabel=true] - Show color label
 * @param {string} [props.size='md'] - Size (sm, md, lg)
 * @param {string} [props.layout='grid'] - Layout (grid, inline, palette)
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * <ColorPicker
 *   value={color}
 *   onChange={setColor}
 *   label="Choose your color"
 * />
 */
export const ColorPicker = ({
  value,
  onChange,
  label,
  showLabel = true,
  size = 'md',
  layout = 'grid',
  className = '',
  ...props
}) => {
  const containerClasses = [
    'color-picker',
    `color-picker--${layout}`,
    className
  ].filter(Boolean).join(' ');

  const handleSelect = (colorName) => {
    onChange(colorName);
  };

  return (
    <div className={containerClasses} {...props}>
      {label && <label className="color-picker__label">{label}</label>}

      <div className="color-picker__options">
        {COLORS.map((color) => {
          const isSelected = value === color.name;
          const buttonClasses = [
            'color-picker__option',
            `color-picker__option--${size}`,
            isSelected && 'color-picker__option--selected'
          ].filter(Boolean).join(' ');

          return (
            <button
              key={color.name}
              type="button"
              className={buttonClasses}
              onClick={() => handleSelect(color.name)}
              aria-label={color.label}
              aria-pressed={isSelected}
              title={color.label}
            >
              <span
                className="color-picker__swatch"
                style={{ backgroundColor: color.hex }}
              />
              {showLabel && layout !== 'palette' && (
                <span className="color-picker__name">{color.label}</span>
              )}
              {isSelected && (
                <span className="color-picker__check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ColorPicker;
