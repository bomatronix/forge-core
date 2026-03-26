import { build } from 'esbuild'

const client = process.argv[2] || 'api'

await build({
  entryPoints: [`dist/apps/${client}/src/lambda.js`],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: `dist/lambda/${client}/handler.js`,
  format: 'cjs',
  minify: true,
  sourcemap: true,
  external: [
    // Native modules that shouldn't be bundled
    '@nestjs/microservices',
    '@nestjs/websockets',
  ],
})

console.log(`Lambda bundle created: dist/lambda/${client}/handler.js`)
