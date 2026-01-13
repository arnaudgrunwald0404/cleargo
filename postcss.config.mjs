const config = {
  plugins: {
    "@tailwindcss/postcss": {},
    "postcss-preset-mantine": {
      features: {
        nested: false, // Disable postcss-nested to avoid conflict with Tailwind CSS v4
      },
    },
    "postcss-simple-vars": {
      variables: {
        "mantine-breakpoint-xs": "36em",
        "mantine-breakpoint-sm": "48em",
        "mantine-breakpoint-md": "62em",
        "mantine-breakpoint-lg": "75em",
        "mantine-breakpoint-xl": "88em",
      },
    },
  },
};

export default config;
