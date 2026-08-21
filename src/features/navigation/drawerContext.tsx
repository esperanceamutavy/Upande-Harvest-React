import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

// Single source of drawer open/close state, provided once in (app)/_layout.tsx.
//
// WHY THIS EXISTS: `Screen` used to own a `menuOpen` boolean and render its own
// `<AppDrawer>`. Since `Screen` wraps every route, that meant one AppDrawer
// instance per screen — and because AppDrawer unmounts when closed, every open
// was a cold mount of the whole panel subtree. Hoisting to one always-available
// instance removes that per-open construction cost.
//
// Deliberately a separate module rather than living in `_layout.tsx`: `Screen`
// needs the hook, and importing it from the layout would couple every screen to
// the route file that renders them.

interface DrawerControls {
  isOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

// No default value on purpose. A no-op default turns "rendered outside the
// provider" into a hamburger that silently does nothing, which is
// indistinguishable from a styling or z-order problem and cost real debugging
// time. Missing provider is a wiring bug and should say so.
const DrawerContext = createContext<DrawerControls | null>(null);

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openDrawer = useCallback(() => {
    console.log('[drawer] 2. openDrawer() called → setIsOpen(true)');
    setIsOpen(true);
  }, []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  console.log('[drawer] 3. DrawerProvider render, isOpen =', isOpen);

  // Memoised so consumers of the context do not re-render on every provider
  // render — the provider sits above the whole tab navigator.
  const value = useMemo(
    () => ({ isOpen, openDrawer, closeDrawer }),
    [isOpen, openDrawer, closeDrawer],
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer(): DrawerControls {
  const ctx = useContext(DrawerContext);
  if (!ctx) {
    throw new Error(
      'useDrawer() called outside <DrawerProvider>. The provider wraps the (app) ' +
        'layout — a screen reaching this is rendered outside that tree.',
    );
  }
  return ctx;
}
