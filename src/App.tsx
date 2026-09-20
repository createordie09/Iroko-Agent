import React from 'react';
import { AppProvider } from './context/AppContext';
import { ZyriconAppShell } from './components/layout/ZyriconAppShell';

export function App() {
  return (
    <AppProvider>
      <ZyriconAppShell />
    </AppProvider>
  );
}

export default App;
