import nextVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextVitals,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
    },
    ignores: [
      ".next/**",
      "node_modules/**",
      "coverage/**",
      "drizzle/**",
      "dispatch.db",
      "dispatch.proof.db",
      "tmp-sqlcipher-check.db",
    ],
  },
];

export default config;
