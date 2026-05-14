import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        lab: {
          bg: "#0d0f12",
          panel: "#15181d",
          panel2: "#1b2027",
          border: "#2b313a",
          text: "#edf1f5",
          muted: "#9aa6b2",
          cyan: "#38bdf8",
          violet: "#a78bfa",
          green: "#22c55e",
          amber: "#f59e0b",
          red: "#ef4444"
        }
      }
    }
  },
  plugins: []
};

export default config;
