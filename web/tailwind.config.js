/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: {
          DEFAULT: "#0b1220",
          deep: "#070d18",
        },
        neon: {
          green: "#22e08a",
          cyan: "#2ee6d6",
          gold: "#ffc95e",
          pink: "#ff5ec9",
        },
      },
      fontFamily: {
        display: ["'Barlow Condensed'", "system-ui", "sans-serif"],
        body: ["'Barlow'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 24px rgba(34, 224, 138, 0.45)",
        "glow-cyan": "0 0 24px rgba(46, 230, 214, 0.45)",
        "glow-gold": "0 0 24px rgba(255, 201, 94, 0.45)",
        "glow-pink": "0 0 24px rgba(255, 94, 201, 0.45)",
        "glow-red": "0 0 24px rgba(248, 113, 113, 0.45)",
        card: "0 20px 60px rgba(0,0,0,0.6)",
      },
      keyframes: {
        "float-in": {
          "0%": { opacity: "0", transform: "translateY(20px) scale(0.96)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "float-in": "float-in 0.5s ease-out both",
        shimmer: "shimmer 2.5s linear infinite",
      },
    },
  },
  plugins: [],
};
