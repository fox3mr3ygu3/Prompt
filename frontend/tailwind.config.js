/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#070A0F",
        "ink-2": "#0D131C",
        "ink-3": "#131C28",
        ivory: "#F7F1E6",
        "ivory-muted": "#BEB3A1",
        brass: "#C8A15A",
        ember: "#FF6B4A",
        aqua: "#54D6CF",
        fern: "#9DCC71",
      },
      fontFamily: {
        sans: ['"DM Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Bricolage Grotesque"', '"DM Sans"', "ui-sans-serif", "sans-serif"],
      },
      boxShadow: {
        glow: "0 24px 80px rgba(84, 214, 207, 0.18)",
        ember: "0 18px 70px rgba(255, 107, 74, 0.16)",
        brass: "0 16px 60px rgba(200, 161, 90, 0.14)",
      },
      backgroundImage: {
        "ticket-grid":
          "linear-gradient(rgba(247,241,230,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(247,241,230,0.055) 1px, transparent 1px)",
        "scan-lines":
          "repeating-linear-gradient(90deg, transparent 0 28px, rgba(247,241,230,0.035) 28px 29px)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "0.42" },
          "50%": { opacity: "0.85" },
        },
      },
      animation: {
        "fade-up": "fade-up 520ms ease both",
        "soft-pulse": "soft-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
