import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    rules: {
      // Flags the standard fetch-on-mount pattern (setLoading(true) then
      // an async fetch) used throughout this app's client components.
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
