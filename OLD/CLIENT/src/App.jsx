import React from 'react';
import MainRouter from './MainRouter';
import {BrowserRouter} from 'react-router-dom';
import EcBridge from '../src/core/EcBridge';

const App = () =>{
  return (
    <BrowserRouter>
      <EcBridge/>
      <MainRouter/>
    </BrowserRouter>
  );
}

export default App;
