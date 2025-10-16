/**
 * App Component
 *
 * Root application component that sets up routing, authentication,
 * and global providers for the EM2 application.
 */

import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { MainRouter } from './router/MainRouter';
import './App.css';

/**
 * App Component
 */
function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <MainRouter />
      </div>
    </BrowserRouter>
  );
}

export default App;
