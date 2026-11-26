import { defineConfig } from 'vite';

// GitHub Pages serves this project beneath /still-audiobook-player/.
// Relative asset URLs also keep the bundle portable to another static host.
export default defineConfig({ base: './' });
