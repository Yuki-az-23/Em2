/**
 * EditProfile Page
 *
 * Page for editing user profile information, including name, email,
 * emotion bridge, and profile photo.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Input,
  Button,
  Card,
  CardBody,
  Avatar,
  EmotionPicker,
  ColorPicker,
  Badge,
  LoadingOverlay,
} from '../../components';
import { useUser, useECBridge } from '../../hooks';
import './EditProfile.css';

/**
 * EditProfile Page Component
 */
export const EditProfile = () => {
  const navigate = useNavigate();
  const { user, loading: userLoading, updateProfile } = useUser();
  const { updateECBridge } = useECBridge();

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [emotion, setEmotion] = useState('joy');
  const [color, setColor] = useState('yellow');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  // UI state
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize form with user data
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
      setEmotion(user.emotion || 'joy');
      setColor(user.color || 'yellow');
      if (user.photo) {
        setPhotoPreview(user.photo);
      }
    }
  }, [user]);

  // Track changes
  useEffect(() => {
    if (user) {
      const changed =
        name !== user.name ||
        email !== user.email ||
        emotion !== user.emotion ||
        color !== user.color ||
        photoFile !== null;
      setHasChanges(changed);
    }
  }, [name, email, emotion, color, photoFile, user]);

  // Handle photo selection
  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setErrors({ ...errors, photo: 'Please select an image file' });
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setErrors({ ...errors, photo: 'Image must be less than 5MB' });
        return;
      }

      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
      setErrors({ ...errors, photo: null });
    }
  };

  // Validation
  const validate = () => {
    const newErrors = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    } else if (name.length > 50) {
      newErrors.name = 'Name must be less than 50 characters';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = 'Email is invalid';
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

    setSaving(true);
    try {
      // Update profile info
      const profileData = {
        name: name.trim(),
        email: email.trim(),
      };

      if (photoFile) {
        profileData.photo = photoFile;
      }

      await updateProfile(profileData);

      // Update ECBridge if changed
      if (emotion !== user.emotion || color !== user.color) {
        await updateECBridge(emotion, color);
      }

      // Navigate back to profile
      navigate('/profile');
    } catch (error) {
      console.error('Failed to update profile:', error);
      setErrors({ submit: error.message || 'Failed to update profile. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // Handle cancel
  const handleCancel = () => {
    if (hasChanges) {
      const confirmLeave = window.confirm(
        'You have unsaved changes. Are you sure you want to leave?'
      );
      if (!confirmLeave) return;
    }
    navigate('/profile');
  };

  // Loading state
  if (userLoading) {
    return <LoadingOverlay />;
  }

  // No user state
  if (!user) {
    return (
      <div className="edit-profile-error">
        <h2>Not Logged In</h2>
        <p>Please log in to edit your profile.</p>
        <Button onClick={() => navigate('/login')}>Go to Login</Button>
      </div>
    );
  }

  return (
    <div className="edit-profile">
      {/* Page Header */}
      <div className="edit-profile-header">
        <h1>Edit Profile</h1>
        <div className="edit-profile-header-actions">
          <Button variant="ghost" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            emotion={emotion}
            onClick={handleSubmit}
            loading={saving}
            disabled={!hasChanges}
          >
            Save Changes
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {errors.submit && (
        <div className="edit-profile-error-banner">
          <p>{errors.submit}</p>
        </div>
      )}

      {/* Main Form */}
      <div className="edit-profile-content">
        {/* Left Column: Basic Info */}
        <div className="edit-profile-main">
          <Card variant="elevated">
            <CardBody>
              <h2>Basic Information</h2>

              {/* Photo Upload */}
              <div className="edit-profile-photo">
                <label>Profile Photo</label>
                <div className="edit-profile-photo-preview">
                  <Avatar
                    name={name}
                    src={photoPreview}
                    emotion={emotion}
                    size="xl"
                  />
                  <div className="edit-profile-photo-actions">
                    <input
                      type="file"
                      id="photo-upload"
                      accept="image/*"
                      onChange={handlePhotoChange}
                      style={{ display: 'none' }}
                    />
                    <Button
                      variant="outline"
                      onClick={() => document.getElementById('photo-upload').click()}
                    >
                      Upload Photo
                    </Button>
                    {photoFile && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setPhotoFile(null);
                          setPhotoPreview(user.photo);
                        }}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                  {errors.photo && (
                    <span className="edit-profile-error-text">{errors.photo}</span>
                  )}
                </div>
              </div>

              {/* Name Input */}
              <div className="edit-profile-field">
                <Input
                  label="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  emotion={emotion}
                  error={errors.name}
                  maxLength={50}
                />
              </div>

              {/* Email Input */}
              <div className="edit-profile-field">
                <Input
                  label="Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  emotion={emotion}
                  error={errors.email}
                />
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Right Column: Emotion Bridge */}
        <div className="edit-profile-sidebar">
          <Card variant="elevated">
            <CardBody>
              <h2>Emotion Bridge</h2>
              <p className="edit-profile-bridge-description">
                Your emotion bridge determines how you interact with content
                and what appears in your feed.
              </p>

              {/* Current Selection */}
              <div className="edit-profile-current">
                <label>Current Bridge</label>
                <div className="edit-profile-current-badges">
                  <Badge variant="emotion" emotion={emotion}>
                    {emotion}
                  </Badge>
                  <Badge variant="default">{color}</Badge>
                </div>
              </div>

              {/* Emotion Picker */}
              <div className="edit-profile-picker">
                <label>Select Emotion</label>
                <EmotionPicker
                  selected={emotion}
                  onChange={setEmotion}
                  layout="grid"
                />
                {errors.emotion && (
                  <span className="edit-profile-error-text">{errors.emotion}</span>
                )}
              </div>

              {/* Color Picker */}
              <div className="edit-profile-picker">
                <label>Select Color</label>
                <ColorPicker
                  selected={color}
                  onChange={setColor}
                  layout="grid"
                />
                {errors.color && (
                  <span className="edit-profile-error-text">{errors.color}</span>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Info Card */}
          <Card variant="flat">
            <CardBody>
              <h3>Profile Tips</h3>
              <ul className="edit-profile-tips">
                <li>Use a clear profile photo</li>
                <li>Choose an emotion that reflects your mood</li>
                <li>Your email is used for login only</li>
                <li>Changes take effect immediately</li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Save Button (Mobile) */}
      <div className="edit-profile-mobile-actions">
        <Button
          variant="outline"
          onClick={handleCancel}
          style={{ flex: 1 }}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          emotion={emotion}
          onClick={handleSubmit}
          loading={saving}
          disabled={!hasChanges}
          style={{ flex: 1 }}
        >
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default EditProfile;
