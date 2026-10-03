// `import.meta.glob` is provided by Vite/Vitest; declared here so the package type-checks without Vite's own types.
interface ImportMeta {
  glob(pattern: string, options: { query: string; import: string; eager: true }): Record<string, string>;
}
