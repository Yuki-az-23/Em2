/**
 * TypingIndicator Component
 *
 * Shows animated typing indicator when someone is typing.
 */

import React from 'react';
import './TypingIndicator.css';

/**
 * TypingIndicator Component
 *
 * @param {Object} props - Component props
 * @param {string} props.userName - Name of user who is typing
 * @param {string} props.size - Size variant ('sm', 'md', 'lg')
 * @returns {JSX.Element}
 */
export const TypingIndicator = ({ userName, size = 'md' }) => {
  return (
    <div className={`typing-indicator typing-indicator--${size}`}>
      <div className="typing-indicator__content">
        <div className="typing-indicator__dots">
          <span className="typing-indicator__dot"></span>
          <span className="typing-indicator__dot"></span>
          <span className="typing-indicator__dot"></span>
        </div>
        {userName && (
          <span className="typing-indicator__text">{userName} is typing...</span>
        )}
      </div>
    </div>
  );
};

export default TypingIndicator;
