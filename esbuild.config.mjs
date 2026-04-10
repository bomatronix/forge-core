import { build, analyzeMetafile } from 'esbuild'
import { existsSync, writeFileSync } from 'fs'

const app = process.argv[2]
if (!app) throw new Error('Usage: node esbuild.config.mjs <app-name>')

const analyze = process.argv.includes('--analyze')

// NestJS apps export from lambda.ts; standalone handlers use handler.ts
const lambdaEntry = `dist/apps/${app}/src/lambda.js`
const handlerEntry = `dist/apps/${app}/src/handler.js`
const entry = existsSync(lambdaEntry)
  ? lambdaEntry
  : existsSync(handlerEntry)
    ? handlerEntry
    : (() => { throw new Error(`No entry point found for app: ${app}. Expected ${lambdaEntry} or ${handlerEntry}`) })()

const outfile = `dist/lambda/${app}/${app}.js`

const result = await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile,
  format: 'cjs',
  minify: true,
  sourcemap: true,
  metafile: true,
  external: [
    // Native modules that shouldn't be bundled
    '@nestjs/microservices',
    '@nestjs/websockets',
    // Dynamic require in @nestjs/mapped-types that doesn't exist at runtime
    'class-transformer/storage',
    // AWS SDK v3 is included in the Lambda nodejs20.x runtime
    '@aws-sdk/*',
  ],
})

const metafilePath = `dist/lambda/${app}/${app}.meta.json`
writeFileSync(metafilePath, JSON.stringify(result.metafile))

const stat = (await import('fs')).statSync(outfile)
const kb = (stat.size / 1024).toFixed(1)
console.log(`Lambda bundle created: ${outfile} (${kb} KB)`)
console.log(`Metafile written:      ${metafilePath}`)
console.log(`Online analyzer:       https://esbuild.github.io/analyze/ (drag & drop the metafile)`)

if (analyze) {
  const text = await analyzeMetafile(result.metafile, { verbose: false })
  console.log('\n' + text)
}
