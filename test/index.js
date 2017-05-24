import zora from 'zora';
import {table} from 'smart-table-core';
import ext from '../index';

zora()
  .test('should dispatch working state change', function * (t) {
    let workingState;
    const tb = table({data: []}, ext({query: (tableState) => Promise.resolve({summary: {}, data: []})}));
    tb.on('EXEC_CHANGED', ({working}) => {
      workingState = working;
    });
    const p = tb.sort({pointer: 'foo'});
    t.equal(workingState, true);
    yield p;
    t.equal(workingState, false);
  })
  .test('should dispatch error when promise is rejected', function * (t) {
    let workingState;
    let err;
    const error = {message: 'ERROR !!!'};
    const tb = table({data: []}, ext({query: (tableState) => Promise.reject(error)}));
    tb.on('EXEC_CHANGED', ({working}) => {
      workingState = working;
    });
    tb.on('EXEC_ERROR', (e) => {
      err = e;
    });
    const p = tb.sort({pointer: 'foo'});
    t.equal(workingState, true);
    try {
      yield p;
    } catch (e) {
      t.fail('should not be here');
    }
    t.equal(workingState, false);
    t.equal(err, error);
  })
  .test('should dispatch summary changed based on the client value', function * (t) {
    let summary;
    const tb = table({data: []}, ext({
      query: (tableState) => Promise.resolve({
        summary: {
          foo: 'bar'
        }, data: []
      })
    }));
    tb.on('SUMMARY_CHANGED', s => {
      summary = s;
    });
    const p = tb.sort({pointer: 'foo'});
    yield p;
    t.deepEqual(summary, {foo: 'bar'});
  })
  .test('should dispatch display changed based on the client value', function * (t) {
    let data;
    const tb = table({data: []}, ext({
      query: (tableState) => Promise.resolve({
        summary: {
          foo: 'bar'
        }, data: [
          {woot: 'blah'},
          {woot: 'im'}
        ]
      })
    }));
    tb.on('DISPLAY_CHANGED', d => {
      data = d;
    });
    const p = tb.sort({pointer: 'foo'});
    yield p;
    t.deepEqual(data, [
        {woot: 'blah'},
        {woot: 'im'}
      ]
    );
  })
  .test('should overwrite eval function to resolve with value provided by client', function * (t) {
    const tb = table({data: []}, ext({
      query: (tableState) => Promise.resolve({
        summary: {
          foo: 'bar'
        }, data: [
          {woot: 'blah'},
          {woot: 'im'}
        ]
      })
    }));

    const d = yield tb.eval();
    t.deepEqual(d, [
      {woot: 'blah'},
      {woot: 'im'}
    ]);
  })
  .run();