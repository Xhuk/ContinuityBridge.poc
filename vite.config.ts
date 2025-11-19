import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // React core libraries
          'react-vendor': ['react', 'react-dom', 'react/jsx-runtime'],
          
          // React Router
          'router': ['wouter'],
          
          // React Query
          'query': ['@tanstack/react-query'],
          
          // UI Components (shadcn/ui + radix)
          'ui-core': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-popover',
            '@radix-ui/react-switch',
            '@radix-ui/react-label',
            '@radix-ui/react-checkbox',
            '@radix-ui/react-slot',
          ],
          
          // Monaco Editor (heavy library)
          'monaco': ['@monaco-editor/react', 'monaco-editor'],
          
          // React Flow (visual flow editor)
          'flow-editor': ['reactflow'],
          
          // Charts and visualization
          'charts': ['recharts'],
          
          // Icon libraries - removed to fix tree-shaking issues
          // 'icons': ['lucide-react'],
          
          // Utility libraries
          'utils': ['clsx', 'tailwind-merge', 'class-variance-authority', 'date-fns'],
          
          // YAML parser
          'yaml': ['yaml'],
        },
      },
    },
    chunkSizeWarningLimit: 1000, // Increase warning threshold to 1MB
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
