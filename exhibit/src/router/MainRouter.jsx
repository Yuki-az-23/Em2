/**
 * Routes. The door is public. The wall is public. Only "me" and "agents" need a session.
 */
import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { PrivateRoute } from './PrivateRoute';
import { LoadingOverlay } from '../components';
import { Navigation } from '../components/Navigation/Navigation';

const Invite = lazy(() => import('../pages/Invite/Invite'));
const Login = lazy(() => import('../pages/Login/Login'));
const Signup = lazy(() => import('../pages/Signup/Signup'));
const Wall = lazy(() => import('../pages/Wall/Wall'));
const Post = lazy(() => import('../pages/Post/Post'));
const Machine = lazy(() => import('../pages/Machine/Machine'));
const Me = lazy(() => import('../pages/Me/Me'));
const Agents = lazy(() => import('../pages/Agents/Agents'));

const withNav = (el) => (<><Navigation />{el}</>);

export const MainRouter = () => (
  <Suspense fallback={<LoadingOverlay />}>
    <Routes>
      <Route path="/" element={<Invite />} />
      <Route path="/join/:code" element={<Invite />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/wall" element={withNav(<Wall />)} />
      <Route path="/post/:postId" element={withNav(<Post />)} />
      <Route path="/machine" element={withNav(<Machine />)} />
      <Route path="/me" element={<PrivateRoute>{withNav(<Me />)}</PrivateRoute>} />
      <Route path="/agents" element={<PrivateRoute>{withNav(<Agents />)}</PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </Suspense>
);

export default MainRouter;
