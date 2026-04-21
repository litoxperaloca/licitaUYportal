import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext()

const THEMES = ['light', 'dark', 'midnight', 'ocean']

const THEME_CLASSES = {
  light:    [],
  dark:     ['dark'],
  midnight: ['dark', 'theme-midnight'],
  ocean:    ['dark', 'theme-ocean'],
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'dark')

  const setTheme = (t) => {
    setThemeState(t)
    localStorage.setItem('theme', t)
  }

  useEffect(() => {
    const root = document.documentElement
    // Remove all theme classes
    root.classList.remove('dark', 'theme-midnight', 'theme-ocean')
    // Apply new theme classes
    const classes = THEME_CLASSES[theme] || []
    classes.forEach(cls => root.classList.add(cls))
  }, [theme])

  const cycleTheme = () => {
    const idx = THEMES.indexOf(theme)
    setTheme(THEMES[(idx + 1) % THEMES.length])
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, cycleTheme, THEMES }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
