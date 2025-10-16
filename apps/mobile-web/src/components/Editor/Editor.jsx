/**
 * Editor Component
 *
 * React wrapper for EditorJS with emotion theming and EM2 integration.
 * Provides a rich text editing experience with emotion-aware styling.
 */

import React, { useEffect, useRef, useState } from 'react';
import EditorJS from '@editorjs/editorjs';
import { getEditorConfig, getEmotionTheme, validateEditorData } from '../../config/editorConfig';
import './Editor.css';
import './blocks/EmotionBlock.css';

/**
 * Editor Component
 *
 * @param {object} props - Component props
 * @param {object} props.data - Initial EditorJS data
 * @param {function} props.onChange - Callback when content changes
 * @param {function} props.onReady - Callback when editor is ready
 * @param {string} props.emotion - Emotion theme (joy, trust, feared, etc.)
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.readOnly - Read-only mode
 * @param {number} props.minHeight - Minimum editor height
 * @param {boolean} props.showStats - Show word/character count
 * @param {number} props.maxLength - Maximum character length
 * @returns {JSX.Element}
 */
export const Editor = ({
  data = null,
  onChange = () => {},
  onReady = () => {},
  emotion = 'joy',
  placeholder = 'Share your emotions...',
  readOnly = false,
  minHeight = 300,
  showStats = true,
  maxLength = null,
  className = '',
  ...props
}) => {
  const editorRef = useRef(null);
  const holderRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [stats, setStats] = useState({ words: 0, characters: 0 });
  const [isOverLimit, setIsOverLimit] = useState(false);

  /**
   * Initialize EditorJS instance
   */
  useEffect(() => {
    if (!holderRef.current || editorRef.current) return;

    // Generate unique holder ID
    const holderId = `editorjs-${Date.now()}`;
    holderRef.current.id = holderId;

    // Initialize EditorJS
    const editor = new EditorJS(
      getEditorConfig({
        holder: holderId,
        placeholder,
        data,
        readOnly,
        minHeight,
        emotion,
        onChange: async () => {
          if (!editorRef.current) return;

          try {
            const outputData = await editorRef.current.save();

            // Calculate stats
            const text = getPlainTextFromBlocks(outputData.blocks);
            const words = text.trim() ? text.trim().split(/\s+/).length : 0;
            const characters = text.length;

            setStats({ words, characters });

            // Check max length
            if (maxLength && characters > maxLength) {
              setIsOverLimit(true);
            } else {
              setIsOverLimit(false);
            }

            // Call onChange callback
            onChange(outputData);
          } catch (error) {
            console.error('Editor save error:', error);
          }
        },
        onReady: () => {
          setIsReady(true);
          onReady();
        },
      })
    );

    editorRef.current = editor;

    // Cleanup on unmount
    return () => {
      if (editorRef.current && typeof editorRef.current.destroy === 'function') {
        editorRef.current.destroy();
        editorRef.current = null;
      }
    };
  }, []); // Only run once on mount

  /**
   * Update editor data when prop changes
   */
  useEffect(() => {
    if (!editorRef.current || !isReady || !data) return;

    const updateData = async () => {
      try {
        if (validateEditorData(data)) {
          await editorRef.current.render(data);
        }
      } catch (error) {
        console.error('Editor render error:', error);
      }
    };

    updateData();
  }, [data, isReady]);

  /**
   * Get plain text from EditorJS blocks
   */
  const getPlainTextFromBlocks = (blocks) => {
    if (!Array.isArray(blocks)) return '';

    return blocks
      .map(block => {
        switch (block.type) {
          case 'paragraph':
          case 'header':
            return block.data.text?.replace(/<[^>]*>/g, '') || '';
          case 'list':
            return block.data.items?.join('\n') || '';
          case 'quote':
            return block.data.text?.replace(/<[^>]*>/g, '') || '';
          case 'code':
            return block.data.code || '';
          default:
            return '';
        }
      })
      .filter(Boolean)
      .join('\n\n');
  };

  // Build CSS classes
  const classes = [
    'editor',
    `editor--${emotion}`,
    getEmotionTheme(emotion),
    readOnly && 'editor--readonly',
    isOverLimit && 'editor--over-limit',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes} {...props}>
      {/* Editor Holder */}
      <div
        ref={holderRef}
        className="editor__holder"
        style={{ minHeight: `${minHeight}px` }}
      />

      {/* Stats Display */}
      {showStats && (
        <div className="editor__stats">
          <span className="editor__stat">
            {stats.words} {stats.words === 1 ? 'word' : 'words'}
          </span>
          <span className="editor__stat-separator">•</span>
          <span className={`editor__stat ${isOverLimit ? 'editor__stat--error' : ''}`}>
            {stats.characters}
            {maxLength && ` / ${maxLength}`} characters
            {isOverLimit && ' (over limit)'}
          </span>
        </div>
      )}

      {/* Loading State */}
      {!isReady && (
        <div className="editor__loading">
          <div className="editor__spinner" />
          <span>Loading editor...</span>
        </div>
      )}
    </div>
  );
};

export default Editor;
