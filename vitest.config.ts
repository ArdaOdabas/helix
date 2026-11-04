import {defineConfig} from 'vitest/config';
// Provider repositories are read-only source data, not Helix test projects.
export default defineConfig({test:{include:['tests/**/*.test.{ts,tsx}']}});
