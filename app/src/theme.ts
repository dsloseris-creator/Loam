// Design tokens: the single place for colors, type, spacing and radius.
export const colors = {
  background: '#F4EFE6', // warm linen
  surface: '#FBF8F2',
  text: '#3A3A32',
  textMuted: '#8A8676',
  border: '#E6DFD0',
  moss: '#7A8F6B', // healthy / ok
  sage: '#A9B89A',
  clay: '#C4745A', // dry, matches the node LED going red
  sand: '#D9A86C', // getting dry, matches the LED's orange
  water: '#7FA3A8', // well watered
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = { sm: 12, md: 20, lg: 28, pill: 999 };

export const type = {
  title: { fontSize: 32, fontWeight: '600' as const, letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  caption: { fontSize: 13, fontWeight: '400' as const },
};

// Darker versions of the accent colors, for text on top of a tinted background
export const ink = { moss: '#46583B', sand: '#80581A', water: '#3A6670' };
