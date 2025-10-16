/**
 * Login Page
 *
 * User authentication page with email/password login.
 */

import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input, Button, Card, CardBody } from '../../components';
import { useAuth } from '../../hooks';
import './Login.css';

/**
 * Login Page Component
 */
export const Login = () => {
  const navigate = useNavigate();
  const { login, loading } = useAuth();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});

  // Validation
  const validate = () => {
    const newErrors = {};

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
      await login({ email: email.trim(), password });
      navigate('/feed');
    } catch (error) {
      console.error('Login failed:', error);
      setErrors({ submit: error.message || 'Invalid email or password' });
    }
  };

  return (
    <div className="login">
      <div className="login-container">
        {/* Branding */}
        <div className="login-branding">
          <h1>EM2</h1>
          <p>Emotion Manager</p>
        </div>

        {/* Login Card */}
        <Card variant="elevated" className="login-card">
          <CardBody>
            <h2>Welcome Back</h2>
            <p className="login-subtitle">Sign in to continue to EM2</p>

            {/* Error Message */}
            {errors.submit && (
              <div className="login-error">
                <p>{errors.submit}</p>
              </div>
            )}

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="login-form">
              {/* Email Input */}
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                error={errors.email}
                autoComplete="email"
                autoFocus
              />

              {/* Password Input */}
              <Input
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                error={errors.password}
                autoComplete="current-password"
              />

              {/* Submit Button */}
              <Button
                type="submit"
                variant="primary"
                emotion="joy"
                loading={loading}
                disabled={!email || !password}
                style={{ width: '100%' }}
              >
                Sign In
              </Button>
            </form>

            {/* Sign Up Link */}
            <div className="login-footer">
              <p>
                Don't have an account?{' '}
                <Link to="/signup" className="login-link">
                  Sign Up
                </Link>
              </p>
            </div>
          </CardBody>
        </Card>

        {/* Features */}
        <div className="login-features">
          <div className="login-feature">
            <span className="login-feature-icon">😊</span>
            <h3>Express Emotions</h3>
            <p>Share your feelings through colors and emotions</p>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">🌈</span>
            <h3>ECBridge System</h3>
            <p>Connect with content based on your emotional state</p>
          </div>
          <div className="login-feature">
            <span className="login-feature-icon">🤝</span>
            <h3>Build Community</h3>
            <p>Follow users and engage with emotional content</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
