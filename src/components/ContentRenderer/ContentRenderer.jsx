/**
 * ContentRenderer Component
 *
 * Renders EditorJS content as static HTML with emotion theming.
 * Used for displaying posts, comments, and other user-generated content.
 */

import React from 'react';
import { validateEditorData } from '../../config/editorConfig';
import './ContentRenderer.css';

/**
 * ContentRenderer Component
 *
 * @param {object} props - Component props
 * @param {object} props.data - EditorJS data to render
 * @param {string} props.emotion - Emotion theme
 * @param {boolean} props.truncate - Truncate long content
 * @param {number} props.maxBlocks - Maximum blocks to show when truncated
 * @param {function} props.onReadMore - Callback for "Read More" button
 * @returns {JSX.Element}
 */
export const ContentRenderer = ({
  data,
  emotion = 'joy',
  truncate = false,
  maxBlocks = 3,
  onReadMore = null,
  className = '',
}) => {
  // Validate data
  if (!validateEditorData(data)) {
    return (
      <div className="content-renderer content-renderer--error">
        <p>Unable to display content</p>
      </div>
    );
  }

  // Get blocks to render
  const blocks = truncate ? data.blocks.slice(0, maxBlocks) : data.blocks;
  const isTruncated = truncate && data.blocks.length > maxBlocks;

  // Build CSS classes
  const classes = [
    'content-renderer',
    `content-renderer--${emotion}`,
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {blocks.map((block, index) => (
        <Block key={`${block.id || index}`} block={block} emotion={emotion} />
      ))}

      {/* Read More Button */}
      {isTruncated && onReadMore && (
        <button
          className="content-renderer__read-more"
          onClick={onReadMore}
        >
          Read More...
        </button>
      )}
    </div>
  );
};

/**
 * Block Component
 * Renders individual EditorJS blocks
 */
const Block = ({ block, emotion }) => {
  const { type, data } = block;

  switch (type) {
    case 'paragraph':
      return <ParagraphBlock data={data} />;

    case 'header':
      return <HeaderBlock data={data} />;

    case 'list':
      return <ListBlock data={data} />;

    case 'quote':
      return <QuoteBlock data={data} emotion={emotion} />;

    case 'code':
      return <CodeBlock data={data} />;

    case 'delimiter':
      return <DelimiterBlock />;

    case 'image':
      return <ImageBlock data={data} />;

    case 'video':
      return <VideoBlock data={data} />;

    case 'embed':
      return <EmbedBlock data={data} />;

    case 'linkTool':
      return <LinkBlock data={data} />;

    case 'emotion':
      return <EmotionBlockRenderer data={data} />;

    default:
      return <UnsupportedBlock type={type} />;
  }
};

/**
 * Paragraph Block
 */
const ParagraphBlock = ({ data }) => {
  if (!data.text) return null;

  return (
    <p
      className="content-block content-block--paragraph"
      dangerouslySetInnerHTML={{ __html: sanitizeHTML(data.text) }}
    />
  );
};

/**
 * Header Block
 */
const HeaderBlock = ({ data }) => {
  const level = data.level || 2;
  const HeadingTag = `h${level}`;

  if (!data.text) return null;

  return (
    <HeadingTag
      className={`content-block content-block--header content-block--header-${level}`}
      dangerouslySetInnerHTML={{ __html: sanitizeHTML(data.text) }}
    />
  );
};

/**
 * List Block
 */
const ListBlock = ({ data }) => {
  if (!data.items || data.items.length === 0) return null;

  const ListTag = data.style === 'ordered' ? 'ol' : 'ul';

  return (
    <ListTag className={`content-block content-block--list content-block--list-${data.style}`}>
      {data.items.map((item, index) => (
        <li
          key={index}
          dangerouslySetInnerHTML={{ __html: sanitizeHTML(item) }}
        />
      ))}
    </ListTag>
  );
};

/**
 * Quote Block
 */
const QuoteBlock = ({ data, emotion }) => {
  if (!data.text) return null;

  return (
    <blockquote className={`content-block content-block--quote content-block--quote-${emotion}`}>
      <p
        className="content-block__quote-text"
        dangerouslySetInnerHTML={{ __html: sanitizeHTML(data.text) }}
      />
      {data.caption && (
        <cite className="content-block__quote-caption">
          {sanitizeText(data.caption)}
        </cite>
      )}
    </blockquote>
  );
};

/**
 * Code Block
 */
const CodeBlock = ({ data }) => {
  if (!data.code) return null;

  return (
    <pre className="content-block content-block--code">
      <code>{sanitizeText(data.code)}</code>
    </pre>
  );
};

/**
 * Delimiter Block
 */
const DelimiterBlock = () => {
  return (
    <div className="content-block content-block--delimiter">
      <span>***</span>
    </div>
  );
};

/**
 * Image Block
 */
const ImageBlock = ({ data }) => {
  if (!data.file || !data.file.url) return null;

  return (
    <figure className="content-block content-block--image">
      <img
        src={data.file.url}
        alt={data.caption || 'Image'}
        loading="lazy"
        onError={(e) => {
          e.target.src = '/assets/placeholder-image.png';
          e.target.onerror = null;
        }}
      />
      {data.caption && (
        <figcaption className="content-block__image-caption">
          {sanitizeText(data.caption)}
        </figcaption>
      )}
    </figure>
  );
};

/**
 * Video Block
 */
const VideoBlock = ({ data }) => {
  if (!data.file || !data.file.url) return null;

  return (
    <figure className="content-block content-block--video">
      <video
        src={data.file.url}
        controls
        preload="metadata"
        className="content-block__video-player"
        onError={(e) => {
          console.error('Video load error:', e);
        }}
      >
        Your browser does not support the video tag.
      </video>
      {data.caption && (
        <figcaption className="content-block__video-caption">
          {sanitizeText(data.caption)}
        </figcaption>
      )}
    </figure>
  );
};

/**
 * Embed Block
 */
const EmbedBlock = ({ data }) => {
  if (!data.embed) return null;

  return (
    <div className="content-block content-block--embed">
      <iframe
        src={data.embed}
        title={data.caption || 'Embedded content'}
        frameBorder="0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
      {data.caption && (
        <p className="content-block__embed-caption">
          {sanitizeText(data.caption)}
        </p>
      )}
    </div>
  );
};

/**
 * Link Block
 */
const LinkBlock = ({ data }) => {
  if (!data.link) return null;

  return (
    <a
      href={data.link}
      target="_blank"
      rel="noopener noreferrer"
      className="content-block content-block--link"
    >
      {data.meta?.title && (
        <div className="content-block__link-title">
          {sanitizeText(data.meta.title)}
        </div>
      )}
      {data.meta?.description && (
        <div className="content-block__link-description">
          {sanitizeText(data.meta.description)}
        </div>
      )}
      {data.meta?.image?.url && (
        <img
          src={data.meta.image.url}
          alt={data.meta.title || 'Link preview'}
          className="content-block__link-image"
        />
      )}
      <div className="content-block__link-url">
        {sanitizeText(data.link)}
      </div>
    </a>
  );
};

/**
 * EmotionBlock Renderer
 */
const EmotionBlockRenderer = ({ data }) => {
  if (!data.emotion) return null;

  const EMOTIONS = {
    joy: { icon: '😊', name: 'Joy' },
    trust: { icon: '🤝', name: 'Trust' },
    feared: { icon: '😨', name: 'Feared' },
    surprised: { icon: '😲', name: 'Surprised' },
    sad: { icon: '😢', name: 'Sad' },
    disgust: { icon: '🤢', name: 'Disgust' },
    angry: { icon: '😠', name: 'Angry' },
    anticipated: { icon: '🤔', name: 'Anticipated' },
  };

  const emotion = EMOTIONS[data.emotion.toLowerCase()] || EMOTIONS.joy;

  return (
    <div className="content-block content-block--emotion-display">
      <div className={`emotion-badge emotion-badge--${data.emotion.toLowerCase()}`}>
        <span className="emotion-badge__icon">{emotion.icon}</span>
        <span className="emotion-badge__name">{emotion.name}</span>
      </div>
      {data.text && (
        <p className="emotion-badge__text">{sanitizeText(data.text)}</p>
      )}
    </div>
  );
};

/**
 * Unsupported Block
 */
const UnsupportedBlock = ({ type }) => {
  if (process.env.NODE_ENV === 'development') {
    return (
      <div className="content-block content-block--unsupported">
        <p>Unsupported block type: {type}</p>
      </div>
    );
  }
  return null;
};

/**
 * Sanitize HTML content
 * Allows basic formatting tags, removes potentially dangerous content
 */
const sanitizeHTML = (html) => {
  if (!html) return '';

  // Create a temporary div to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Remove script tags
  const scripts = temp.getElementsByTagName('script');
  for (let i = scripts.length - 1; i >= 0; i--) {
    scripts[i].remove();
  }

  // Remove event handlers
  const allElements = temp.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const attributes = allElements[i].attributes;
    for (let j = attributes.length - 1; j >= 0; j--) {
      const attr = attributes[j];
      if (attr.name.startsWith('on')) {
        allElements[i].removeAttribute(attr.name);
      }
    }
  }

  return temp.innerHTML;
};

/**
 * Sanitize plain text
 * Removes HTML tags and special characters
 */
const sanitizeText = (text) => {
  if (!text) return '';

  const temp = document.createElement('div');
  temp.textContent = text;
  return temp.innerHTML;
};

export default ContentRenderer;
