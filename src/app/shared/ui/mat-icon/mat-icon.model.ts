export type IconType = 'outline' | 'fill';
export type IconSize = 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl';
export type Weight = '100' | '200' | '300' | '400' | '500' | '600' | '700';
export type IconColor = 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'info';
export const ICON_SIZE_CLASSES: Record<IconSize, string> = {
  xs: 'text-[length:var(--text-xs)]!',
  sm: 'text-[length:var(--text-sm)]!',
  base: 'text-[length:var(--text-base)]!',
  lg: 'text-[length:var(--text-lg)]!',
  xl: 'text-[length:var(--text-xl)]!',
  '2xl': 'text-[length:var(--text-2xl)]!',
  '3xl': 'text-[length:var(--text-3xl)]!',
  '4xl': 'text-[length:var(--text-4xl)]!',
  '5xl': 'text-[length:var(--text-5xl)]!',
  '6xl': 'text-[length:var(--text-6xl)]!',
  '7xl': 'text-[length:var(--text-7xl)]!',
};

/**
 * Default icon size inside any button (matButton, matIconButton, or native button).
 * Single source of truth for all button icons across the application.
 */
export const DEFAULT_BUTTON_ICON_SIZE: IconSize = 'lg';

/**
 * Default icon size for standalone icons placed outside buttons.
 */
export const DEFAULT_STANDALONE_ICON_SIZE: IconSize = '2xl';
