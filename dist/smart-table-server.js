(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
  typeof define === 'function' && define.amd ? define(factory) :
  (global = global || self, global['smart-table-server'] = factory());
}(this, function () { 'use strict';

  var index = ({query}) => ({table, tableState}) => {
    const exec = () => {
      table.dispatch('EXEC_CHANGED', {working: true});
      return query(tableState)
        .then(({data = [], summary = {}}) => {
          table.dispatch('SUMMARY_CHANGED', summary);
          table.dispatch('DISPLAY_CHANGED', data);
          table.dispatch('EXEC_CHANGED', {working: false});
        })
        .catch(e => {
          table.dispatch('EXEC_ERROR', e);
          table.dispatch('EXEC_CHANGED', {working: false});
        });
    };

    return Object.assign(table, {
      exec, eval: (ts = tableState) => query(ts).then(({data}) => data)
    });
  };

  return index;

}));
