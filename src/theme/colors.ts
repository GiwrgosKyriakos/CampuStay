// Primitive palette and semantic color tokens for light/dark themes.
export const primitiveColors = {
  white: "#FFFFFF",
  black: "#0A0A0A",
  charcoal: "#1A1A1A",

  cyan900: "#083D4A",
  cyan800: "#0A4250",
  cyan750: "#0B4757",
  cyan700: "#0E4F5E",
  cyan650: "#13505E",
  cyan600: "#1C5A68",
  cyan500: "#3E6B72",
  cyan400: "#5F8E95",
  cyan300: "#8BB4B9",
  cyan200: "#A9C7CB",
  cyan100: "#BDD5D8",
  cyan50:  "#CCE2E5",
  cyan25:  "#DBEEF0",
  
  brand500: "#E07A2F",
  brand400: "#F2A65A",
  error500: "#FF5A5F",
} as const;

export interface ThemeColors {
  isDark: boolean;
  surface: string;
  onSurface: string;
  surfaceSecondary: string;
  surfaceTertiary: string;
  onSurfaceTertiary: string;
  surfaceInverse: string;
  onSurfaceInverse: string;
  muted: string;
  brand: string;
  onBrand: string;
  brandSecondary: string;
  onBrandSecondary: string;
  brandTertiary: string;
  onBrandTertiary: string;
  success: string;
  warning: string;
  error: string;
  onError: string;
  border: string;
  borderStrong: string;
  divider: string;
}

export const lightColors: ThemeColors = {
  isDark: false,
  surface: primitiveColors.cyan25,
  onSurface: primitiveColors.cyan800,
  surfaceSecondary: primitiveColors.cyan50,
  surfaceTertiary: primitiveColors.cyan100,
  onSurfaceTertiary: primitiveColors.cyan500,
  surfaceInverse: primitiveColors.charcoal,
  onSurfaceInverse: primitiveColors.white,
  muted: primitiveColors.cyan400,
  brand: primitiveColors.brand500,
  onBrand: primitiveColors.black,
  brandSecondary: primitiveColors.brand400,
  onBrandSecondary: primitiveColors.black,
  brandTertiary: primitiveColors.cyan100,
  onBrandTertiary: primitiveColors.cyan800,
  success: primitiveColors.brand500,
  warning: primitiveColors.brand400,
  error: primitiveColors.error500,
  onError: primitiveColors.white,
  border: primitiveColors.cyan300,
  borderStrong: primitiveColors.cyan700,
  divider: primitiveColors.cyan200,
};

export const darkColors: ThemeColors = {
  isDark: true,
  surface: primitiveColors.cyan900,
  onSurface: primitiveColors.white,
  surfaceSecondary: primitiveColors.cyan700,
  surfaceTertiary: primitiveColors.cyan750,
  onSurfaceTertiary: primitiveColors.cyan200,
  surfaceInverse: primitiveColors.charcoal,
  onSurfaceInverse: primitiveColors.white,
  muted: primitiveColors.cyan300,
  brand: primitiveColors.brand500,
  onBrand: primitiveColors.black,
  brandSecondary: primitiveColors.brand400,
  onBrandSecondary: primitiveColors.black,
  brandTertiary: primitiveColors.cyan800,
  onBrandTertiary: primitiveColors.brand500,
  success: primitiveColors.brand500,
  warning: primitiveColors.brand400,
  error: primitiveColors.error500,
  onError: primitiveColors.white,
  border: primitiveColors.cyan600,
  borderStrong: primitiveColors.white,
  divider: primitiveColors.cyan650,
};

// Keep existing usage stable while enabling semantic light/dark tokens.
export const colors: ThemeColors = darkColors;
