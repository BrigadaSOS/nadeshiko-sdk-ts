import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi-spec/openapi.yaml',
  output: {
    path: './src/generated',
  },
  client: 'fetch',
});
