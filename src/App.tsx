import React from 'react';
import { AppProvider } from './context/AppContext';
import { UndoDeletionProvider } from './context/UndoDeletionContext';
import { ZyriconAppShell } from './components/layout/ZyriconAppShell';

export function App() {
  return (
    <AppProvider>
      <UndoDeletionProvider>
        <ZyriconAppShell />
      </UndoDeletionProvider>
    </AppProvider>
  );
}

export default App;
