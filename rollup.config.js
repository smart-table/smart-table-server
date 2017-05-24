import node from 'rollup-plugin-node-resolve';
export default {
  entry: 'index.js',
  dest: 'dist/smart-table-server.js',
  format: 'umd',
  plugins: [node({jsnext: true})],
  moduleName: 'smart-table-server'
};
