import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        stage: "#15122A",
        riser: "#201C3B",
        rail: "#2C2750",
        spot: "#F4B942",
        spotdim: "#C8922A",
        house: "#F1ECE2",
        haze: "#9A93C4",
        cue: "#E2685B",
        go: "#6CC59A",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["Figtree", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        rise: { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "none" } },
        crossfade: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: {
        rise: "rise .5s ease-out both",
        crossfade: "crossfade 1.2s ease both",
      },
    },
  },
  plugins: [],
};
export default config;
