

// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from 'node:url';

const __filename_vite_config = fileURLToPath(import.meta.url);
const __dirname_vite_config = path.dirname(__filename_vite_config); // This is PROJECT_ROOT/server

export default defineConfig(({ command, mode }) => {
  const plugins = [
    react(),
  ];
  
  const projectRoot = path.resolve(__dirname_vite_config, ".."); // Define project root

  return {
    plugins: plugins,
    define: {
      'import.meta.env.VITE_FORCE_AUTH_BYPASS': JSON.stringify(process.env.VITE_FORCE_AUTH_BYPASS || process.env.FORCE_AUTH_BYPASS || 'false'),
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL || process.env.APP_BASE_URL || ''),
      'import.meta.env.VITE_GOOGLE_CLIENT_ID': JSON.stringify(process.env.VITE_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''),
    },
    resolve: {
      alias: [
        // Corrected alias path relative to vite.config.ts location (server/)
        { find: '@/', replacement: path.resolve(__dirname_vite_config, '../client/src/') }, 
        { find: '@shared/', replacement: path.resolve(__dirname_vite_config, '../shared/') },
        { find: '@assets/', replacement: path.resolve(__dirname_vite_config, '../attached_assets/') },
      ],
    },
    root: projectRoot, // Set Vite root to project root
    build: {
      outDir: path.resolve(projectRoot, "dist/public"), // Ensure outDir is absolute from new project root
      emptyOutDir: true,
      rollupOptions: {
        // If your root index.html is now the main entry, ensure it's found.
        // Vite will typically find 'index.html' in the `root` directory.
        // input: path.resolve(projectRoot, 'index.html'), // Explicitly set if needed
        output: {
          manualChunks: {
            'grapesjs-sdk': ['@grapesjs/studio-sdk'], 
            'grapesjs-plugins': ['@grapesjs/studio-sdk-plugins'],
          }
        }
      },
    },
    server: { 
      port: 3000, 
      host: '0.0.0.0',
      allowedHosts: [
        'localhost', '127.0.0.1', '0.0.0.0',
        'work-1-cixzsejsspdqlyvw.prod-runtime.all-hands.dev',
        'work-2-cixzsejsspdqlyvw.prod-runtime.all-hands.dev',
        '.all-hands.dev', '.prod-runtime.all-hands.dev'
      ],
    },
    optimizeDeps: {
      include: [
        '@grapesjs/studio-sdk',
        '@grapesjs/studio-sdk-plugins'
      ],
    },
  };
});