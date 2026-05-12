/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#172033",
        mist: "#f6f8fb",
      },
      boxShadow: {
        soft: "0 18px 50px rgba(22, 32, 51, 0.08)",
      },
    },
  },
  plugins: [],
};
