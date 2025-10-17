/**
 * CircularEmotionPicker Component
 *
 * Circular emotion selector with stroked outlines (based on design mockup)
 * Shows emotions arranged in a circle with center display
 */

import React from 'react';
import './CircularEmotionPicker.css';

const EMOTIONS = [
  { name: 'joy', label: 'Joy', angle: 0, color: 'var(--emotion-joy-yellow)' },
  { name: 'trust', label: 'Trust', angle: 45, color: 'var(--emotion-trust-lime)' },
  { name: 'feared', label: 'Feared', angle: 90, color: 'var(--emotion-feared-green)' },
  { name: 'surprised', label: 'Surprised', angle: 135, color: 'var(--emotion-surprised-aqua)' },
  { name: 'sad', label: 'Sad', angle: 180, color: 'var(--emotion-sad-blue)' },
  { name: 'disgust', label: 'Disgust', angle: 225, color: 'var(--emotion-disgust-pink)' },
  { name: 'angry', label: 'Angry', angle: 270, color: 'var(--emotion-angry-red)' },
  { name: 'anticipated', label: 'Anticipated', angle: 315, color: 'var(--emotion-anticipated-orange)' },
];

const RADIUS = 140; // Distance from center to emotion circles

/**
 * Calculate position based on angle
 */
const getPosition = (angle) => {
  const radian = (angle - 90) * (Math.PI / 180); // -90 to start from top
  return {
    x: Math.cos(radian) * RADIUS,
    y: Math.sin(radian) * RADIUS,
  };
};

export const CircularEmotionPicker = ({
  selected,
  onChange,
  selectedColor = 'yellow',
  className = '',
}) => {
  return (
    <div className={`circular-emotion-picker ${className}`}>
      <svg
        className="circular-emotion-picker__svg"
        viewBox="-160 -160 320 320"
        width="320"
        height="320"
      >
        {/* Emotions as stroked circles */}
        {EMOTIONS.map((emotion) => {
          const pos = getPosition(emotion.angle);
          const isSelected = selected === emotion.name;

          return (
            <g
              key={emotion.name}
              className="circular-emotion-picker__emotion"
              onClick={() => onChange(emotion.name)}
              style={{ cursor: 'pointer' }}
            >
              {/* Stroked circle */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r="24"
                fill={isSelected ? emotion.color : 'transparent'}
                stroke={emotion.color}
                strokeWidth={isSelected ? '3' : '2'}
                className="circular-emotion-picker__circle"
                style={{
                  transition: 'all 0.3s ease',
                }}
              />

              {/* Emotion label */}
              <text
                x={pos.x}
                y={pos.y * 1.4} // Position label outside circle
                textAnchor="middle"
                className="circular-emotion-picker__label"
                fill="var(--color-gray-900)"
                fontSize="14"
                fontWeight={isSelected ? '700' : '600'}
              >
                {emotion.label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Center display */}
      <div className="circular-emotion-picker__center">
        <div className="circular-emotion-picker__center-title">Your ECBridge</div>
        <div className="circular-emotion-picker__center-value">
          <span className="circular-emotion-picker__center-emotion">
            {selected}
          </span>
          <span className="circular-emotion-picker__center-plus">+</span>
          <span className="circular-emotion-picker__center-color">
            {selectedColor}
          </span>
        </div>
      </div>
    </div>
  );
};

export default CircularEmotionPicker;
