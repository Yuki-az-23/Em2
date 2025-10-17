/**
 * SkeletonLoader Component
 *
 * Loading skeleton for improved perceived performance.
 * Shows placeholder content while data is loading.
 */

import React from 'react';
import './SkeletonLoader.css';

/**
 * SkeletonLoader Component
 *
 * @param {Object} props - Component props
 * @param {string} [props.variant] - Variant type ('text', 'circle', 'rectangle')
 * @param {string} [props.width] - Width (CSS value, e.g., '100%', '200px')
 * @param {string} [props.height] - Height (CSS value)
 * @param {number} [props.count=1] - Number of skeleton items
 * @param {string} [props.className] - Additional CSS classes
 */
export const SkeletonLoader = ({
  variant = 'text',
  width,
  height,
  count = 1,
  className = '',
  ...props
}) => {
  const skeletons = Array.from({ length: count }, (_, i) => i);

  const style = {
    width,
    height,
  };

  return (
    <>
      {skeletons.map((index) => (
        <div
          key={index}
          className={`skeleton-loader skeleton-loader--${variant} ${className}`}
          style={style}
          {...props}
        />
      ))}
    </>
  );
};

/**
 * SkeletonText - Text skeleton with multiple lines
 */
export const SkeletonText = ({ lines = 3, className = '' }) => {
  return (
    <div className={`skeleton-text ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <SkeletonLoader
          key={i}
          variant="text"
          width={i === lines - 1 ? '70%' : '100%'}
        />
      ))}
    </div>
  );
};

/**
 * SkeletonCard - Card skeleton
 */
export const SkeletonCard = ({ className = '' }) => {
  return (
    <div className={`skeleton-card ${className}`}>
      <div className="skeleton-card__header">
        <SkeletonLoader variant="circle" width="48px" height="48px" />
        <div className="skeleton-card__header-text">
          <SkeletonLoader variant="text" width="120px" />
          <SkeletonLoader variant="text" width="80px" />
        </div>
      </div>
      <div className="skeleton-card__body">
        <SkeletonText lines={3} />
      </div>
    </div>
  );
};

export default SkeletonLoader;
