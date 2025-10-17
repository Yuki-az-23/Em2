/**
 * Signup Page
 *
 * User registration page with email/password signup and emotion bridge selection.
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Input,
  Button,
  Card,
  CardBody,
  EmotionPicker,
  ColorPicker,
  Badge,
} from '../../components';
import { useAuth } from '../../hooks';
import './Signup.css';

/**
 * Signup Page Component
 */
export const Signup = () => {
  const navigate = useNavigate();
  const { signup, loading } = useAuth();

  // Form state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emotion, setEmotion] = useState('joy');
  const [color, setColor] = useState('yellow');
  const [errors, setErrors] = useState({});

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

    if (!password) {
      newErrors.password = 'Password is required';
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
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
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        password,
        emotion,
        color,
      });
      navigate('/feed');
    } catch (error) {
      console.error('Signup failed:', error);
      setErrors({ submit: error.message || 'Failed to create account' });
    }
  };

  return (
    <div className="signup">
      <div className="signup-container">
        {/* Branding */}
        <div className="signup-branding">
          <h1>EM2</h1>
          <p>Emotion Manager</p>
        </div>

        {/* Signup Card */}
        <Card variant="elevated" className="signup-card">
          <CardBody>
            <h2>Create Account</h2>
            <p className="signup-subtitle">Join EM2 and start expressing your emotions</p>

            {/* Error Message */}
            {errors.submit && (
              <div className="signup-error">
                <p>{errors.submit}</p>
              </div>
            )}

            {/* Signup Form */}
            <form onSubmit={handleSubmit} className="signup-form">
              {/* Name Input */}
              <Input
                label="Name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                error={errors.name}
                autoComplete="name"
                autoFocus
                maxLength={50}
              />

              {/* Email Input */}
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                error={errors.email}
                autoComplete="email"
              />

              {/* Password Input */}
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                error={errors.password}
                autoComplete="new-password"
              />

              {/* Confirm Password Input */}
              <Input
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                error={errors.confirmPassword}
                autoComplete="new-password"
              />

              {/* Emotion Bridge Section */}
              <div className="signup-bridge">
                <h3>Choose Your Emotion Bridge</h3>
                <p className="signup-bridge-description">
                  Your emotion bridge determines how you interact with content
                </p>

                {/* Current Selection */}
                <div className="signup-current">
                  <Badge variant="emotion" emotion={emotion}>
                    {emotion}
                  </Badge>
                  <Badge variant="default">{color}</Badge>
                </div>

                {/* Emotion Picker */}
                <div className="signup-picker">
                  <label>Select Emotion</label>
                  <EmotionPicker
                    selected={emotion}
                    onChange={setEmotion}
                    layout="grid"
                  />
                  {errors.emotion && (
                    <span className="signup-error-text">{errors.emotion}</span>
                  )}
                </div>

                {/* Color Picker */}
                <div className="signup-picker">
                  <label>Select Color</label>
                  <ColorPicker
                    selected={color}
                    onChange={setColor}
                    layout="grid"
                  />
                  {errors.color && (
                    <span className="signup-error-text">{errors.color}</span>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                emotion={emotion}
                loading={loading}
                disabled={!name || !email || !password || !confirmPassword}
                style={{ width: '100%' }}
              >
                Create Account
              </Button>
            </form>

            {/* Login Link */}
            <div className="signup-footer">
              <p>
                Already have an account?{' '}
                <Link to="/login" className="signup-link">
                  Sign In
                </Link>
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
};

export default Signup;
