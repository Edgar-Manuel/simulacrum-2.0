import { defineConfig } from 'vitest/config';
import path from 'path';

// We don't load the React plugin here on purpose: the tests target pure
// services (no JSX). Loading vite-plugin-react would pull wagmi/viem into
// the test runtime and force a lot of ESM gymnastics for no benefit.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
        // Don't touch the heavyweight UI / wallet code paths from unit tests.
        exclude: ['node_modules', 'dist', 'src/App.tsx'],
        globals: false,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: [
                'src/services/risk/**',
                'src/services/trading/**',
                'src/services/ai/agentService.ts',
            ],
        },
    },
    resolve: {
        alias: {
            'http-proxy-agent': path.resolve(__dirname, 'src/stubs/empty.ts'),
            'https-proxy-agent': path.resolve(__dirname, 'src/stubs/empty.ts'),
            'socks-proxy-agent': path.resolve(__dirname, 'src/stubs/empty.ts'),
        },
    },
});
