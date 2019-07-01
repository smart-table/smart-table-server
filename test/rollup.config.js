import  node from 'rollup-plugin-node-resolve';
export default {
  input: './test/index.js',
  output: {
    file: './test/dist/index.js',
    format: 'iife',
    name: 'test',
    sourcemap: true
  },
  plugins: [node({jsnext: true})],
};