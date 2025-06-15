import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { 
        format: 'es',
        manualChunks: {
          'ag-grid': ['ag-grid-community', 'ag-grid-react'],
          'arrow': ['apache-arrow'],
          'vega': ['react-vega', 'vega-lite'],
        }
      },
    },
    target: 'es2022',
  },
  optimizeDeps: {
    include: ['ag-grid-community', 'ag-grid-react', 'apache-arrow', 'react-vega']
  },
  worker: {
    format: 'es',
  },
}); 