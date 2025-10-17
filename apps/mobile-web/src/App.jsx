/**
 * App Component
 *
 * Root application component that sets up routing, authentication,
 * and global providers for the EM2 application.
 */

import React, { useEffect } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MainRouter } from './router/MainRouter';
import { statusBar } from './services/native';
import './App.css';

/**
 * App Component
 */
function App() {
  // Initialize native features
  useEffect(() => {
    // Initialize status bar on mount
    statusBar.initStatusBar();
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <MainRouter />
      </div>
    </BrowserRouter>
  );
}

export default App;
