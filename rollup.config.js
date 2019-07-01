import node from 'rollup-plugin-node-resolve';
export default {
  input: 'index.js',
  output: {
    file: 'dist/smart-table-server.js',
    format: 'umd',
    name: 'smart-table-server',
  },
  plugins: [node({jsnext: true})],
};
