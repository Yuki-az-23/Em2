/**
 * MainRouter Component
 *
 * Main routing configuration for the application.
 * Defines all routes and their associated components.
 */

import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute';
import { LoadingOverlay } from '../components';
import { Navigation } from '../components/Navigation/Navigation';

// Lazy load pages for code splitting
const Feed = lazy(() => import('../pages/Feed/Feed'));
const CreatePost = lazy(() => import('../pages/CreatePost/CreatePost'));
const PostDetail = lazy(() => import('../pages/PostDetail/PostDetail'));
const Profile = lazy(() => import('../pages/Profile/Profile'));
const EditProfile = lazy(() => import('../pages/EditProfile/EditProfile'));
const Login = lazy(() => import('../pages/Login/Login'));
const Signup = lazy(() => import('../pages/Signup/Signup'));

/**
 * MainRouter Component
 */
export const MainRouter = () => {
  return (
    <Suspense fallback={<LoadingOverlay />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Private Routes (require authentication) */}
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Navigate to="/feed" replace />
            </PrivateRoute>
          }
        />

        <Route
          path="/feed"
          element={
            <PrivateRoute>
              <>
                <Navigation />
                <Feed />
              </>
            </PrivateRoute>
          }
        />

        <Route
          path="/post/create"
          element={
            <PrivateRoute>
              <>
                <Navigation />
                <CreatePost />
              </>
            </PrivateRoute>
          }
        />

        <Route
          path="/post/:postId"
          element={
            <PrivateRoute>
              <>
                <Navigation />
                <PostDetail />
              </>
            </PrivateRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <PrivateRoute>
              <>
                <Navigation />
                <Profile />
              </>
            </PrivateRoute>
          }
        />

        <Route
          path="/user/:userId"
          element={
            <PrivateRoute>
              <>
                <Navigation />
                <Profile />
              </>
            </PrivateRoute>
          }
        />

        <Route
          path="/profile/edit"
          element={
            <PrivateRoute>
              <>
                <Navigation />
                <EditProfile />
              </>
            </PrivateRoute>
          }
        />

        {/* 404 Not Found */}
        <Route path="*" element={<Navigate to="/feed" replace />} />
      </Routes>
    </Suspense>
  );
};

export default MainRouter;
