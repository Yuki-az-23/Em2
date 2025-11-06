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
import VideoTool from '@weekwood/editorjs-video';
import EmotionBlock from '../components/Editor/blocks/EmotionBlock.js';
import { uploadPostImage, uploadPostVideo, validateImageUrl } from '../services/storage/mediaStorage.js';
import { supabase } from '../services/supabase/client.js';

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
       * For creating hyperlinks (without preview endpoint)
       */
      linkTool: {
        class: LinkTool,
        config: {
          // No endpoint needed - will just create basic links without previews
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
       * For uploading and displaying images via Supabase Storage
       */
      image: {
        class: ImageTool,
        config: {
          /**
           * Supabase Storage uploader
           * Uploads images to post-images bucket
           */
          uploader: {
            /**
             * Upload image from device
             * @param {File} file - Image file to upload
             * @returns {Promise<{success: number, file: {url: string}}>}
             */
            uploadByFile: async (file) => {
              try {
                // Get current user ID
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                  throw new Error('You must be logged in to upload images');
                }

                // Upload to Supabase Storage
                const result = await uploadPostImage(file, user.id);
                return result;

              } catch (error) {
                console.error('Image upload error:', error);
                return {
                  success: 0,
                  error: error.message || 'Failed to upload image',
                };
              }
            },

            /**
             * Upload image from URL
             * @param {string} url - Image URL
             * @returns {Promise<{success: number, file: {url: string}}>}
             */
            uploadByUrl: async (url) => {
              return await validateImageUrl(url);
            },
          },

          // Image tool configuration
          types: 'image/*',
          captionPlaceholder: 'Enter image caption',
          buttonContent: 'Select an image',
        },
      },

      /**
       * Video tool
       * For uploading and displaying videos via Supabase Storage
       */
      video: {
        class: VideoTool,
        config: {
          /**
           * Supabase Storage uploader
           * Uploads videos to post-videos bucket
           */
          uploader: {
            /**
             * Upload video from device
             * @param {File} file - Video file to upload
             * @returns {Promise<{success: number, file: {url: string}}>}
             */
            uploadByFile: async (file) => {
              try {
                // Get current user ID
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                  throw new Error('You must be logged in to upload videos');
                }

                // Upload to Supabase Storage
                const result = await uploadPostVideo(file, user.id);
                return result;

              } catch (error) {
                console.error('Video upload error:', error);
                return {
                  success: 0,
                  error: error.message || 'Failed to upload video',
                };
              }
            },

            /**
             * Upload video from URL
             * @param {string} url - Video URL
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
                console.error('Invalid video URL:', error);
                return {
                  success: 0,
                  error: 'Invalid URL format',
                };
              }
            },
          },

          // Video tool configuration
          captionPlaceholder: 'Enter video caption',
          buttonContent: 'Select a video',
        },
      },

      /**
       * EmotionBlock tool
       * Custom EM2 block for expressing emotions
       */
      emotion: {
        class: EmotionBlock,
        shortcut: 'CMD+SHIFT+E',
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
