import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  nextTheme,
  persistTheme,
  readStoredTheme,
  type Theme,
} from '../src/theme/theme';

/** Minimal document root stand-in so the palette logic is testable without a DOM. */
function fakeRoot() {
  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  return {
    attributes,
    classes,
    style: { colorScheme: '' } as { colorScheme: string },
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    classList: {
      toggle(name: string, on?: boolean) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
    },
  };
}

describe('Theme preference', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => void store.set(key, value),
    };
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('1. defaults to light when no preference is stored', () => {
    assert.equal(DEFAULT_THEME, 'light');
    assert.equal(readStoredTheme(), 'light');
  });

  it('2. persists and restores the chosen theme', () => {
    persistTheme('dark');
    assert.equal(store.get(THEME_STORAGE_KEY), 'dark');
    assert.equal(readStoredTheme(), 'dark');
    persistTheme('light');
    assert.equal(readStoredTheme(), 'light');
  });

  it('3. an unknown stored value falls back to light', () => {
    store.set(THEME_STORAGE_KEY, 'ultraviolet');
    assert.equal(readStoredTheme(), 'light');
  });

  it('4. unavailable storage never throws', () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    assert.equal(readStoredTheme(), 'light');
    assert.doesNotThrow(() => persistTheme('dark'));
  });

  it('5. applying a theme sets the attribute, the class and color-scheme', () => {
    const root = fakeRoot();
    applyTheme('dark', root as unknown as HTMLElement);
    assert.equal(root.attributes.get('data-theme'), 'dark');
    assert.equal(root.classes.has('dark'), true);
    assert.equal(root.style.colorScheme, 'dark');

    applyTheme('light', root as unknown as HTMLElement);
    assert.equal(root.attributes.get('data-theme'), 'light');
    assert.equal(root.classes.has('dark'), false);
    assert.equal(root.style.colorScheme, 'light');
  });

  it('6. the toggle flips between exactly two themes', () => {
    const seen: Theme[] = [];
    let theme: Theme = 'light';
    for (let i = 0; i < 4; i += 1) {
      seen.push(theme);
      theme = nextTheme(theme);
    }
    assert.deepEqual(seen, ['light', 'dark', 'light', 'dark']);
  });
});
