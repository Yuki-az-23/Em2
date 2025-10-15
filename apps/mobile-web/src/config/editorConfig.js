/**
 * EditorJS Configuration for EM2
 *
 * Configures EditorJS with emotion-aware tools and custom settings
 * for the EM2 social media platform.
 */

import Header from '@editorjs/header';
import List from '@editorjs/list';
import Paragraph from '@editorjs/paragraph';
import ImageTool from '@editorjs/image';
import Quote from '@editorjs/quote';
import Code from '@editorjs/code';
import InlineCode from '@editorjs/inline-code';
import Embed from '@editorjs/embed';
import LinkTool from '@editorjs/link';
import Marker from '@editorjs/marker';
import Delimiter from '@editorjs/delimiter';

/**
 * Default EditorJS configuration
 * Includes all standard tools with EM2-specific settings
 */
export const getEditorConfig = (options = {}) => {
  const {
    holder = 'editorjs',
    placeholder = 'Share your emotions...',
    onChange = () => {},
    onReady = () => {},
    data = null,
    readOnly = false,
    minHeight = 300,
    emotion = 'joy',
  } = options;

  return {
    holder,
    placeholder,
    onChange,
    onReady,
    data,
    readOnly,
    minHeight,

    /**
     * EditorJS Tools Configuration
     * Each tool is configured with EM2-specific defaults
     */
    tools: {
      /**
       * Paragraph tool (default)
       * The main text block for content
       */
      paragraph: {
        class: Paragraph,
        inlineToolbar: true,
        config: {
          placeholder: placeholder,
          preserveBlank: true,
        },
      },

      /**
       * Header tool
       * Supports levels 2-4 (H1 reserved for page titles)
       */
      header: {
        class: Header,
        inlineToolbar: true,
        config: {
          placeholder: 'Enter a heading',
          levels: [2, 3, 4],
          defaultLevel: 2,
        },
        shortcut: 'CMD+SHIFT+H',
      },

      /**
       * List tool
       * Ordered and unordered lists
       */
      list: {
        class: List,
        inlineToolbar: true,
        config: {
          defaultStyle: 'unordered',
        },
        shortcut: 'CMD+SHIFT+L',
      },

      /**
       * Quote tool
       * For blockquotes and callouts
       */
      quote: {
        class: Quote,
        inlineToolbar: true,
        config: {
          quotePlaceholder: 'Enter a quote',
          captionPlaceholder: 'Quote author',
        },
        shortcut: 'CMD+SHIFT+Q',
      },

      /**
       * Code tool
       * For code blocks with syntax highlighting support
       */
      code: {
        class: Code,
        config: {
          placeholder: 'Enter code',
        },
        shortcut: 'CMD+SHIFT+C',
      },

      /**
       * Inline Code tool
       * For inline code snippets within text
       */
      inlineCode: {
        class: InlineCode,
        shortcut: 'CMD+SHIFT+K',
      },

      /**
       * Marker tool
       * For highlighting text
       */
      marker: {
        class: Marker,
        shortcut: 'CMD+SHIFT+M',
      },

      /**
       * Delimiter tool
       * For visual section breaks
       */
      delimiter: {
        class: Delimiter,
        shortcut: 'CMD+SHIFT+D',
      },

      /**
       * Link tool
       * For creating hyperlinks with previews
       */
      linkTool: {
        class: LinkTool,
        config: {
          endpoint: '/api/link/fetch', // Endpoint for link preview data
        },
      },

      /**
       * Embed tool
       * For embedding external content (YouTube, Twitter, etc.)
       */
      embed: {
        class: Embed,
        config: {
          services: {
            youtube: true,
            twitter: true,
            instagram: true,
            codepen: true,
            vimeo: true,
          },
        },
      },

      /**
       * Image tool
       * For uploading and displaying images
       */
      image: {
        class: ImageTool,
        config: {
          /**
           * Custom uploader function
           * Integrates with EM2's image upload API
           */
          uploader: {
            /**
             * Upload image from device
             * @param {File} file - Image file to upload
             * @returns {Promise<{success: number, file: {url: string}}>}
             */
            uploadByFile: async (file) => {
              const formData = new FormData();
              formData.append('image', file);

              try {
                const response = await fetch('/api/posts/photo', {
                  method: 'POST',
                  body: formData,
                  headers: {
                    'Authorization': `Bearer ${localStorage.getItem('jwt')}`,
                  },
                });

                const data = await response.json();

                if (!response.ok) {
                  throw new Error(data.error || 'Upload failed');
                }

                return {
                  success: 1,
                  file: {
                    url: data.url || `/api/posts/photo/${data.postId}`,
                  },
                };
              } catch (error) {
                console.error('Image upload error:', error);
                return {
                  success: 0,
                  error: error.message,
                };
              }
            },

            /**
             * Upload image from URL
             * @param {string} url - Image URL
             * @returns {Promise<{success: number, file: {url: string}}>}
             */
            uploadByUrl: async (url) => {
              try {
                // Validate URL format
                new URL(url);

                return {
                  success: 1,
                  file: {
                    url: url,
                  },
                };
              } catch (error) {
                console.error('Invalid image URL:', error);
                return {
                  success: 0,
                  error: 'Invalid URL format',
                };
              }
            },
          },

          // Image tool configuration
          types: 'image/*',
          captionPlaceholder: 'Enter image caption',
          buttonContent: 'Select an image',
          uploader: {
            uploadByFile: async (file) => {
              // Placeholder for actual upload logic
              return {
                success: 1,
                file: {
                  url: URL.createObjectURL(file),
                },
              };
            },
          },
        },
      },
    },

    /**
     * i18n configuration
     * Internationalization settings
     */
    i18n: {
      messages: {
        ui: {
          blockTunes: {
            toggler: {
              'Click to tune': 'Click to tune',
            },
          },
          toolbar: {
            toolbox: {
              Add: 'Add',
            },
          },
        },
      },
    },

    /**
     * Autofocus configuration
     * Automatically focus the editor on mount
     */
    autofocus: !readOnly,

    /**
     * Log level
     * Controls console output (ERROR, WARN, INFO, VERBOSE)
     */
    logLevel: process.env.NODE_ENV === 'development' ? 'WARN' : 'ERROR',
  };
};

/**
 * Emotion-specific editor themes
 * CSS classes for emotion-based styling
 */
export const EMOTION_THEMES = {
  joy: 'editor-theme-joy',
  trust: 'editor-theme-trust',
  feared: 'editor-theme-feared',
  surprised: 'editor-theme-surprised',
  sad: 'editor-theme-sad',
  disgust: 'editor-theme-disgust',
  angry: 'editor-theme-angry',
  anticipated: 'editor-theme-anticipated',
};

/**
 * Get emotion theme class
 * @param {string} emotion - Emotion name
 * @returns {string} - CSS class for emotion theme
 */
export const getEmotionTheme = (emotion) => {
  return EMOTION_THEMES[emotion?.toLowerCase()] || EMOTION_THEMES.joy;
};

/**
 * Validate EditorJS data
 * Ensures the data structure is valid
 * @param {object} data - EditorJS data to validate
 * @returns {boolean} - True if valid
 */
export const validateEditorData = (data) => {
  if (!data || typeof data !== 'object') return false;
  if (!Array.isArray(data.blocks)) return false;
  return data.blocks.every(block =>
    block &&
    typeof block === 'object' &&
    block.type &&
    typeof block.type === 'string'
  );
};

/**
 * Get plain text from EditorJS data
 * Extracts text content from blocks
 * @param {object} data - EditorJS data
 * @returns {string} - Plain text content
 */
export const getPlainText = (data) => {
  if (!validateEditorData(data)) return '';

  return data.blocks
    .map(block => {
      switch (block.type) {
        case 'paragraph':
        case 'header':
          return block.data.text || '';
        case 'list':
          return block.data.items?.join('\n') || '';
        case 'quote':
          return block.data.text || '';
        case 'code':
          return block.data.code || '';
        default:
          return '';
      }
    })
    .filter(Boolean)
    .join('\n\n');
};

/**
 * Get word count from EditorJS data
 * @param {object} data - EditorJS data
 * @returns {number} - Word count
 */
export const getWordCount = (data) => {
  const text = getPlainText(data);
  if (!text) return 0;
  return text.trim().split(/\s+/).length;
};

/**
 * Get character count from EditorJS data
 * @param {object} data - EditorJS data
 * @returns {number} - Character count
 */
export const getCharacterCount = (data) => {
  const text = getPlainText(data);
  return text.length;
};

/**
 * Truncate EditorJS data to specified length
 * @param {object} data - EditorJS data
 * @param {number} maxLength - Maximum character length
 * @returns {object} - Truncated EditorJS data
 */
export const truncateEditorData = (data, maxLength = 200) => {
  if (!validateEditorData(data)) return data;

  let currentLength = 0;
  const truncatedBlocks = [];

  for (const block of data.blocks) {
    const blockText = getPlainText({ blocks: [block] });

    if (currentLength + blockText.length <= maxLength) {
      truncatedBlocks.push(block);
      currentLength += blockText.length;
    } else {
      // Truncate this block and stop
      const remainingLength = maxLength - currentLength;
      if (remainingLength > 0 && block.type === 'paragraph') {
        truncatedBlocks.push({
          ...block,
          data: {
            ...block.data,
            text: block.data.text.substring(0, remainingLength) + '...',
          },
        });
      }
      break;
    }
  }

  return {
    ...data,
    blocks: truncatedBlocks,
  };
};

export default getEditorConfig;
