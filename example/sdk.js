//a fake sdk to mimic a server: it actually uses another smart-table to process a query and return the result with a random timeout to mimic the http response time
import {smartTable as table} from 'smart-table-core';

export default () => {
  const t = table({data});
  return {
    query: (tableState) => {
      return new Promise((resolve, reject) => {
        //this timeout is just to avoid the ui to freeze as normally the process would run on the server
        setTimeout(function () {
          const notSlicedState = Object.assign({}, tableState, {
            slice: {page: 1}
          });
          Promise
            .all([t.eval(tableState), t.eval(notSlicedState)])
            .then(([full, partial]) => {
              //random timeout on the response to mimic the server response time
              setTimeout(() => {
                resolve({
                  data: full,
                  summary: {
                    page: tableState.slice.page,
                    size: tableState.slice.size,
                    filteredCount: partial.length
                  }
                });
              }, Math.random() * 2000);
            })
            .catch(e => reject(e));
        }, 20)
      });
    }
  };
};


