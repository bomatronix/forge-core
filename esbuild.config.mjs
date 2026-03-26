import { build } from 'esbuild'

await build({
  entryPoints: ['dist/apps/api/lambda.js'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'dist/lambda/handler.js',
  format: 'cjs',
  minify: true,
  sourcemap: true,
  external: [
    // Native modules that shouldn't be bundled
    '@nestjs/microservices',
    '@nestjs/websockets',
    'class-transformer',
    'class-validator',
  ],
})

console.log('Lambda bundle created: dist/lambda/handler.js')
