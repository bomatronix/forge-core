import { build } from 'esbuild'
import { existsSync } from 'fs'

const app = process.argv[2]
if (!app) throw new Error('Usage: node esbuild.config.mjs <app-name>')

// NestJS apps export from lambda.ts; standalone handlers use handler.ts
const lambdaEntry = `dist/apps/${app}/src/lambda.js`
const handlerEntry = `dist/apps/${app}/src/handler.js`
const entry = existsSync(lambdaEntry)
  ? lambdaEntry
  : existsSync(handlerEntry)
    ? handlerEntry
    : (() => { throw new Error(`No entry point found for app: ${app}. Expected ${lambdaEntry} or ${handlerEntry}`) })()

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: `dist/lambda/${app}/handler.js`,
  format: 'cjs',
  minify: true,
  sourcemap: true,
  external: [
    // Native modules that shouldn't be bundled
    '@nestjs/microservices',
    '@nestjs/websockets',
    // Dynamic require in @nestjs/mapped-types that doesn't exist at runtime
    'class-transformer/storage',
  ],
})

console.log(`Lambda bundle created: dist/lambda/${app}/handler.js`)
