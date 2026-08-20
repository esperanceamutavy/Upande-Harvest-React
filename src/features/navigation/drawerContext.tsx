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

const DrawerContext = createContext<DrawerControls>({
  isOpen: false,
  // No-ops so a `Screen` rendered outside the provider still works — its
  // hamburger simply does nothing rather than crashing. Every current consumer
  // is inside the (app) group, so this is a guard, not a supported mode.
  openDrawer: () => {},
  closeDrawer: () => {},
});

export function DrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const openDrawer = useCallback(() => setIsOpen(true), []);
  const closeDrawer = useCallback(() => setIsOpen(false), []);

  // Memoised so consumers of the context do not re-render on every provider
  // render — the provider sits above the whole tab navigator.
  const value = useMemo(
    () => ({ isOpen, openDrawer, closeDrawer }),
    [isOpen, openDrawer, closeDrawer],
  );

  return <DrawerContext.Provider value={value}>{children}</DrawerContext.Provider>;
}

export function useDrawer() {
  return useContext(DrawerContext);
}
