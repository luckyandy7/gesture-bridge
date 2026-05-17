import { FlatCompat } from "@eslint/eslintrc"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      ".venv/**",
      ".pnpm-store/**",
      "**/__pycache__/**",
      "node_modules/**",
      "public/mediapipe/**",
      "signlanguageProject/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
]

export default eslintConfig
