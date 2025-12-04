import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  colors: {
    blue: [
      '#E7F5FF',
      '#D0EBFF',
      '#A5D8FF',
      '#74C0FC',
      '#4DABF7',
      '#339AF0',
      '#228BE6', // Primary color
      '#1C7ED6',
      '#1971C2',
      '#1864AB',
    ],
    green: [
      '#EBFBEE',
      '#D3F9D8',
      '#B2F2BB',
      '#8CE99A',
      '#69DB7C',
      '#51CF66',
      '#40C057',
      '#37B24D',
      '#2F9E44',
      '#12B886', // Go/Green accent
    ],
    yellow: [
      '#FFF9DB',
      '#FFF3BF',
      '#FFEC99',
      '#FFE066',
      '#FFD43B',
      '#FCC419',
      '#FAB005', // Conditional/Amber accent
      '#F59F00',
      '#F08C00',
      '#E67700',
    ],
    red: [
      '#FFF5F5',
      '#FFE3E3',
      '#FFC9C9',
      '#FFA8A8',
      '#FF8787',
      '#FF6B6B',
      '#FA5252', // No Go/Red accent
      '#F03E3E',
      '#E03131',
      '#C92A2A',
    ],
  },
  fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
  headings: {
    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
    fontWeight: '700',
  },
  spacing: {
    xl: '128px',
  },
  defaultRadius: 'md',
});



