/**
 * CreatePost Page
 *
 * Page for creating new posts with EditorJS rich text editor.
 * Includes emotion/color selection and post preview.
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Editor,
  Input,
  Button,
  Card,
  CardBody,
  CardFooter,
  EmotionPicker,
  ColorPicker,
  Badge,
  Modal,
  ContentRenderer,
} from '../../components';
import { usePost, useUser } from '../../hooks';
import { getPlainText, getWordCount, validateEditorData } from '../../config/editorConfig';
import './CreatePost.css';

/**
 * CreatePost Page Component
 */
export const CreatePost = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { createPost, loading } = usePost();

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState(null);
  const [emotion, setEmotion] = useState(user?.emotion || 'joy');
  const [color, setColor] = useState(user?.color || 'yellow');

  // UI state
  const [showPreview, setShowPreview] = useState(false);
  const [errors, setErrors] = useState({});

  // Validation
  const validate = () => {
    const newErrors = {};

    if (!title.trim()) {
      newErrors.title = 'Title is required';
    } else if (title.length < 3) {
      newErrors.title = 'Title must be at least 3 characters';
    } else if (title.length > 100) {
      newErrors.title = 'Title must be less than 100 characters';
    }

    if (!content || !validateEditorData(content)) {
      newErrors.content = 'Content is required';
    } else {
      const plainText = getPlainText(content);
      if (plainText.length < 10) {
        newErrors.content = 'Content must be at least 10 characters';
      } else if (plainText.length > 10000) {
        newErrors.content = 'Content must be less than 10,000 characters';
      }
    }

    if (!emotion) {
      newErrors.emotion = 'Please select an emotion';
    }

    if (!color) {
      newErrors.color = 'Please select a color';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle submit
  const handleSubmit = async () => {
    if (!validate()) {
      return;
    }

    try {
      const plainText = getPlainText(content);

      const newPost = await createPost({
        title: title.trim(),
        body: plainText, // Plain text preview
        content, // Full EditorJS data
        emotion,
        color,
        initialEmotion: emotion,
        initialColor: color,
      });

      // Navigate to the new post
      navigate(`/post/${newPost._id}`);
    } catch (error) {
      console.error('Failed to create post:', error);
      setErrors({ submit: 'Failed to create post. Please try again.' });
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (title || content) {
      const confirmLeave = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      );
      if (!confirmLeave) return;
    }
    navigate('/feed');
  };

  // Handle preview
  const handlePreview = () => {
    if (validate()) {
      setShowPreview(true);
    }
  };

  // Calculate stats
  const wordCount = content ? getWordCount(content) : 0;
  const readingTime = Math.ceil(wordCount / 200); // 200 words per minute

  return (
    <div className="create-post">
      {/* Page Header */}
      <div className="create-post-header">
        <h1>Create a New Post</h1>
        <div className="create-post-header__actions">
          <Button variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="outline" onClick={handlePreview} emotion={emotion}>
            Preview
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            emotion={emotion}
            loading={loading}
            disabled={!title || !content}
          >
            Publish Post
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {errors.submit && (
        <div className="create-post-error">
          <p>{errors.submit}</p>
        </div>
      )}

      {/* Main Form */}
      <div className="create-post-content">
        {/* Left Column: Editor */}
        <div className="create-post-editor">
          <Card variant="flat">
            <CardBody>
              {/* Title Input */}
              <div className="create-post-field">
                <Input
                  label="Post Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Give your post a compelling title..."
                  emotion={emotion}
                  error={errors.title}
                  maxLength={100}
                />
              </div>

              {/* Rich Text Editor */}
              <div className="create-post-field">
                <label className="create-post-label">Content</label>
                <Editor
                  data={content}
                  onChange={setContent}
                  emotion={emotion}
                  placeholder="Share your emotions and thoughts..."
                  showStats={true}
                  maxLength={10000}
                  minHeight={500}
                />
                {errors.content && (
                  <span className="create-post-field-error">{errors.content}</span>
                )}
              </div>

              {/* Post Stats */}
              <div className="create-post-stats">
                <Badge variant="default">
                  {wordCount} {wordCount === 1 ? 'word' : 'words'}
                </Badge>
                <Badge variant="default">~{readingTime} min read</Badge>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Right Column: Settings */}
        <div className="create-post-sidebar">
          <Card variant="elevated">
            <CardBody>
              <h3>Post Settings</h3>

              {/* Emotion Selection */}
              <div className="create-post-setting">
                <label>Emotion</label>
                <EmotionPicker
                  selected={emotion}
                  onChange={setEmotion}
                  layout="grid"
                />
                {errors.emotion && (
                  <span className="create-post-field-error">{errors.emotion}</span>
                )}
              </div>

              {/* Color Selection */}
              <div className="create-post-setting">
                <label>Color</label>
                <ColorPicker
                  selected={color}
                  onChange={setColor}
                  layout="grid"
                />
                {errors.color && (
                  <span className="create-post-field-error">{errors.color}</span>
                )}
              </div>

              {/* Current Selection Display */}
              <div className="create-post-current">
                <p>Current Selection:</p>
                <div className="create-post-current__badges">
                  <Badge variant="emotion" emotion={emotion}>
                    {emotion}
                  </Badge>
                  <Badge variant="default">{color}</Badge>
                </div>
              </div>
            </CardBody>

            <CardFooter>
              <Button
                variant="primary"
                emotion={emotion}
                onClick={handleSubmit}
                loading={loading}
                disabled={!title || !content}
                style={{ width: '100%' }}
              >
                Publish Post
              </Button>
            </CardFooter>
          </Card>

          {/* Tips Card */}
          <Card variant="flat">
            <CardBody>
              <h4>Writing Tips</h4>
              <ul className="create-post-tips">
                <li>Use the EmotionBlock (CMD+SHIFT+E) to express emotions</li>
                <li>Add images to make your post visually appealing</li>
                <li>Use headers to organize longer posts</li>
                <li>Keep your title clear and descriptive</li>
                <li>Preview before publishing</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Preview Modal */}
      <Modal
        isOpen={showPreview}
        onClose={() => setShowPreview(false)}
        size="lg"
      >
        <div className="create-post-preview">
          <div className="create-post-preview-header">
            <h2>Post Preview</h2>
            <Badge variant="emotion" emotion={emotion}>
              {emotion}
            </Badge>
          </div>

          <div className="create-post-preview-content">
            <h1>{title}</h1>
            <div className="create-post-preview-meta">
              <span>{user?.name}</span>
              <span>•</span>
              <span>~{readingTime} min read</span>
            </div>

            <ContentRenderer data={content} emotion={emotion} />
          </div>

          <div className="create-post-preview-footer">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close Preview
            </Button>
            <Button
              variant="primary"
              emotion={emotion}
              onClick={() => {
                setShowPreview(false);
                handleSubmit();
              }}
              loading={loading}
            >
              Publish Now
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default CreatePost;
