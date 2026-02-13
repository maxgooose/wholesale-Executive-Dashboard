/**
 * Theme Switcher Module
 * Handles dark/light mode switching with system preference detection
 */

(function() {
    'use strict';

    const STORAGE_KEY = 'ued-theme';
    const THEMES = {
        LIGHT: 'light',
        DARK: 'dark',
        SYSTEM: 'system'
    };

    /**
     * Get the current system preference
     */
    function getSystemPreference() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return THEMES.DARK;
        }
        return THEMES.LIGHT;
    }

    /**
     * Get stored theme preference
     */
    function getStoredTheme() {
        try {
            return localStorage.getItem(STORAGE_KEY);
        } catch (e) {
            return null;
        }
    }

    /**
     * Store theme preference
     */
    function storeTheme(theme) {
        try {
            localStorage.setItem(STORAGE_KEY, theme);
        } catch (e) {
            console.warn('Could not save theme preference');
        }
    }

    /**
     * Apply theme to document
     */
    function applyTheme(theme) {
        const resolvedTheme = theme === THEMES.SYSTEM ? getSystemPreference() : theme;
        document.documentElement.setAttribute('data-theme', resolvedTheme);
        
        // Update meta theme-color for mobile browsers
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            metaTheme.content = resolvedTheme === THEMES.DARK ? '#0a0a0a' : '#fafafa';
        }

        // Dispatch event for other components to react
        window.dispatchEvent(new CustomEvent('themechange', { 
            detail: { theme: resolvedTheme, preference: theme } 
        }));
    }

    /**
     * Initialize theme
     */
    function init() {
        const stored = getStoredTheme();
        const theme = stored || THEMES.SYSTEM;
        applyTheme(theme);

        // Listen for system preference changes
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                const currentPref = getStoredTheme();
                if (!currentPref || currentPref === THEMES.SYSTEM) {
                    applyTheme(THEMES.SYSTEM);
                }
            });
        }
    }

    /**
     * Toggle between light and dark themes
     */
    function toggle() {
        const current = document.documentElement.getAttribute('data-theme');
        const newTheme = current === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
        storeTheme(newTheme);
        applyTheme(newTheme);
        return newTheme;
    }

    /**
     * Set a specific theme
     */
    function setTheme(theme) {
        if (Object.values(THEMES).includes(theme)) {
            storeTheme(theme);
            applyTheme(theme);
            return theme;
        }
        console.warn(`Invalid theme: ${theme}`);
        return null;
    }

    /**
     * Get current theme
     */
    function getCurrentTheme() {
        return document.documentElement.getAttribute('data-theme');
    }

    /**
     * Get current preference (might be 'system')
     */
    function getPreference() {
        return getStoredTheme() || THEMES.SYSTEM;
    }

    // Initialize immediately (before DOM ready to prevent flash)
    init();

    // Expose API globally
    window.themeToggle = toggle;
    window.setTheme = setTheme;
    window.getCurrentTheme = getCurrentTheme;
    window.getThemePreference = getPreference;

    // Also expose as module for imports
    window.ThemeSwitcher = {
        toggle,
        setTheme,
        getCurrentTheme,
        getPreference,
        THEMES
    };
})();


