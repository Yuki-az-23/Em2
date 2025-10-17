/**
 * PostCard Component
 *
 * Swipeable post card with Embrace (left) and Dissolve (right) actions
 * Based on design mockup
 */

import React, { useState } from 'react';
import { useSwipeable } from 'react-swipeable';
import { Badge } from '../Badge/Badge';
import './PostCard.css';

const SWIPE_THRESHOLD = 80; // Minimum distance to trigger action

export const PostCard = ({
  post,
  onEmbrace,
  onDissolve,
  onClick,
  className = '',
}) => {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [swipeDirection, setSwipeDirection] = useState(null);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleSwipeStart = () => {
    setIsAnimating(false);
  };

  const handleSwiping = (eventData) => {
    const offset = eventData.deltaX;
    setSwipeOffset(offset);

    // Determine direction
    if (offset < -SWIPE_THRESHOLD) {
      setSwipeDirection('left'); // Embrace
    } else if (offset > SWIPE_THRESHOLD) {
      setSwipeDirection('right'); // Dissolve
    } else {
      setSwipeDirection(null);
    }
  };

  const handleSwipedLeft = async () => {
    setIsAnimating(true);
    setSwipeOffset(-400); // Animate off screen

    // Wait for animation
    setTimeout(async () => {
      await onEmbrace(post.id);
      resetSwipe();
    }, 300);
  };

  const handleSwipedRight = async () => {
    setIsAnimating(true);
    setSwipeOffset(400); // Animate off screen

    // Wait for animation
    setTimeout(async () => {
      await onDissolve(post.id);
      resetSwipe();
    }, 300);
  };

  const resetSwipe = () => {
    setSwipeOffset(0);
    setSwipeDirection(null);
    setIsAnimating(false);
  };

  const swipeHandlers = useSwipeable({
    onSwipeStart: handleSwipeStart,
    onSwiping: handleSwiping,
    onSwipedLeft: handleSwipedLeft,
    onSwipedRight: handleSwipedRight,
    trackMouse: true, // Allow mouse dragging on desktop
    preventDefaultTouchmoveEvent: true,
    delta: 10, // Minimum distance before detecting swipe
  });

  const opacity = isAnimating
    ? 0
    : 1 - Math.abs(swipeOffset) / 400;

  const rotation = swipeOffset / 20; // Slight rotation during swipe

  return (
    <div
      {...swipeHandlers}
      className={`post-card ${className}`}
      style={{
        transform: `translateX(${swipeOffset}px) rotate(${rotation}deg)`,
        opacity,
        transition: isAnimating || swipeOffset === 0
          ? 'transform 0.3s ease, opacity 0.3s ease'
          : 'none',
      }}
      onClick={(e) => {
        // Only trigger onClick if not swiping
        if (Math.abs(swipeOffset) < 10 && onClick) {
          onClick(post);
        }
      }}
    >
      {/* Embrace Indicator (Left) */}
      {swipeDirection === 'left' && (
        <div className="post-card__swipe-indicator post-card__swipe-indicator--embrace">
          <div className="post-card__swipe-icon">❤️</div>
          <div className="post-card__swipe-label">Embrace</div>
        </div>
      )}

      {/* Dissolve Indicator (Right) */}
      {swipeDirection === 'right' && (
        <div className="post-card__swipe-indicator post-card__swipe-indicator--dissolve">
          <div className="post-card__swipe-icon">🌫️</div>
          <div className="post-card__swipe-label">Dissolve</div>
        </div>
      )}

      {/* Post Content */}
      <div className="post-card__content">
        {/* User Info */}
        <div className="post-card__header">
          <div className="post-card__avatar">
            {post.user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="post-card__user-info">
            <div className="post-card__user-name">{post.user?.name || 'Anonymous'}</div>
            <div className="post-card__user-emotion">
              Feeling {post.emotion}
            </div>
          </div>
          <div className="post-card__emotion-badges">
            <Badge variant="emotion" emotion={post.emotion}>
              {post.emotion}
            </Badge>
            <Badge variant="default">{post.color}</Badge>
          </div>
        </div>

        {/* Post Body */}
        <div className="post-card__body">
          {post.title && <h2 className="post-card__title">{post.title}</h2>}
          <p className="post-card__text">{post.body}</p>
        </div>

        {/* Post Footer */}
        <div className="post-card__footer">
          <button className="post-card__action">
            <span className="post-card__action-icon">❤️</span>
            <span className="post-card__action-count">{post.brace_count || 42}</span>
          </button>
          <button className="post-card__action">
            <span className="post-card__action-icon">💬</span>
            <span className="post-card__action-count">{post.comment_count || 8}</span>
          </button>
          <div className="post-card__emotion-indicator">
            <Badge variant="emotion" emotion={post.emotion} size="sm">
              {post.emotion}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PostCard;
