/**
 * LazyImage Component
 *
 * Image component with lazy loading, fallback, and error handling.
 * Uses Intersection Observer API for efficient lazy loading.
 */

import React, { useState, useEffect, useRef } from 'react';
import './LazyImage.css';

/**
 * LazyImage Component
 *
 * @param {Object} props - Component props
 * @param {string} props.src - Image source URL
 * @param {string} props.alt - Alt text for accessibility
 * @param {string} [props.placeholder] - Placeholder image URL
 * @param {string} [props.className] - Additional CSS classes
 * @param {Function} [props.onLoad] - Callback when image loads
 * @param {Function} [props.onError] - Callback when image fails to load
 * @param {number} [props.threshold=0.1] - Intersection observer threshold
 * @param {string} [props.rootMargin='50px'] - Root margin for early loading
 */
export const LazyImage = ({
  src,
  alt,
  placeholder,
  className = '',
  onLoad,
  onError,
  threshold = 0.1,
  rootMargin = '50px',
  ...props
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsInView(true);
            observer.disconnect();
          }
        });
      },
      {
        threshold,
        rootMargin,
      }
    );

    observer.observe(img);

    return () => {
      observer.disconnect();
    };
  }, [threshold, rootMargin]);

  // Handle image load
  const handleLoad = () => {
    setIsLoaded(true);
    setHasError(false);
    if (onLoad) onLoad();
  };

  // Handle image error
  const handleError = () => {
    setHasError(true);
    setIsLoaded(true);
    if (onError) onError();
  };

  return (
    <div
      className={`lazy-image ${className}`}
      ref={imgRef}
      {...props}
    >
      {!isLoaded && !hasError && (
        <div className="lazy-image__placeholder" />
      )}

      {isInView && !hasError && (
        <img
          src={src}
          alt={alt}
          className={`lazy-image__img ${isLoaded ? 'lazy-image__img--loaded' : ''}`}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
        />
      )}

      {hasError && (
        <div className="lazy-image__error">
          <span className="lazy-image__error-icon">🖼️</span>
          <span className="lazy-image__error-text">Image failed to load</span>
        </div>
      )}
    </div>
  );
};

export default LazyImage;
