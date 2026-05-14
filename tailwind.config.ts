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
          bg: "#070a0f",
          panel: "#0f1620",
          panel2: "#141d29",
          border: "#263243",
          text: "#edf1f5",
          muted: "#9aa6b2",
          cyan: "#38bdf8",
          violet: "#a78bfa",
          blue: "#3b82f6",
          green: "#22c55e",
          amber: "#facc15",
          orange: "#fb923c",
          red: "#ef4444"
        }
      }
    }
  },
  plugins: []
};

export default config;
