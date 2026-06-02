import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#0e7490",
          dark: "#0f172a",
        },
      },
    },
  },
  plugins: [],
};

export default config;
