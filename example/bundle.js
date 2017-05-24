(function () {
'use strict';

function swap (f) {
  return (a, b) => f(b, a);
}

function compose (first, ...fns) {
  return (...args) => fns.reduce((previous, current) => current(previous), first(...args));
}

function curry (fn, arityLeft) {
  const arity = arityLeft || fn.length;
  return (...args) => {
    const argLength = args.length || 1;
    if (arity === argLength) {
      return fn(...args);
    } else {
      const func = (...moreArgs) => fn(...args, ...moreArgs);
      return curry(func, arity - args.length);
    }
  };
}



function tap (fn) {
  return arg => {
    fn(arg);
    return arg;
  }
}

function pointer (path) {

  const parts = path.split('.');

  function partial (obj = {}, parts = []) {
    const p = parts.shift();
    const current = obj[p];
    return (current === undefined || parts.length === 0) ?
      current : partial(current, parts);
  }

  function set (target, newTree) {
    let current = target;
    const [leaf, ...intermediate] = parts.reverse();
    for (let key of intermediate.reverse()) {
      if (current[key] === undefined) {
        current[key] = {};
        current = current[key];
      }
    }
    current[leaf] = Object.assign(current[leaf] || {}, newTree);
    return target;
  }

  return {
    get(target){
      return partial(target, [...parts])
    },
    set
  }
}

function sortByProperty (prop) {
  const propGetter = pointer(prop).get;
  return (a, b) => {
    const aVal = propGetter(a);
    const bVal = propGetter(b);

    if (aVal === bVal) {
      return 0;
    }

    if (bVal === undefined) {
      return -1;
    }

    if (aVal === undefined) {
      return 1;
    }

    return aVal < bVal ? -1 : 1;
  }
}

function sortFactory ({pointer: pointer$$1, direction} = {}) {
  if (!pointer$$1 || direction === 'none') {
    return array => [...array];
  }

  const orderFunc = sortByProperty(pointer$$1);
  const compareFunc = direction === 'desc' ? swap(orderFunc) : orderFunc;

  return (array) => [...array].sort(compareFunc);
}

function typeExpression (type) {
  switch (type) {
    case 'boolean':
      return Boolean;
    case 'number':
      return Number;
    case 'date':
      return (val) => new Date(val);
    default:
      return compose(String, (val) => val.toLowerCase());
  }
}

const operators = {
  includes(value){
    return (input) => input.includes(value);
  },
  is(value){
    return (input) => Object.is(value, input);
  },
  isNot(value){
    return (input) => !Object.is(value, input);
  },
  lt(value){
    return (input) => input < value;
  },
  gt(value){
    return (input) => input > value;
  },
  lte(value){
    return (input) => input <= value;
  },
  gte(value){
    return (input) => input >= value;
  },
  equals(value){
    return (input) => value == input;
  },
  notEquals(value){
    return (input) => value != input;
  }
};

const every = fns => (...args) => fns.every(fn => fn(...args));

function predicate ({value = '', operator = 'includes', type = 'string'}) {
  const typeIt = typeExpression(type);
  const operateOnTyped = compose(typeIt, operators[operator]);
  const predicateFunc = operateOnTyped(value);
  return compose(typeIt, predicateFunc);
}

//avoid useless filter lookup (improve perf)
function normalizeClauses (conf) {
  const output = {};
  const validPath = Object.keys(conf).filter(path => Array.isArray(conf[path]));
  validPath.forEach(path => {
    const validClauses = conf[path].filter(c => c.value !== '');
    if (validClauses.length) {
      output[path] = validClauses;
    }
  });
  return output;
}

function filter$1 (filter) {
  const normalizedClauses = normalizeClauses(filter);
  const funcList = Object.keys(normalizedClauses).map(path => {
    const getter = pointer(path).get;
    const clauses = normalizedClauses[path].map(predicate);
    return compose(getter, every(clauses));
  });
  const filterPredicate = every(funcList);

  return (array) => array.filter(filterPredicate);
}

var search$1 = function (searchConf = {}) {
  const {value, scope = []} = searchConf;
  const searchPointers = scope.map(field => pointer(field).get);
  if (!scope.length || !value) {
    return array => array;
  } else {
    return array => array.filter(item => searchPointers.some(p => String(p(item)).includes(String(value))))
  }
};

function sliceFactory ({page = 1, size} = {}) {
  return function sliceFunction (array = []) {
    const actualSize = size || array.length;
    const offset = (page - 1) * actualSize;
    return array.slice(offset, offset + actualSize);
  };
}

function emitter () {

  const listenersLists = {};
  const instance = {
    on(event, ...listeners){
      listenersLists[event] = (listenersLists[event] || []).concat(listeners);
      return instance;
    },
    dispatch(event, ...args){
      const listeners = listenersLists[event] || [];
      for (let listener of listeners) {
        listener(...args);
      }
      return instance;
    },
    off(event, ...listeners){
      if (!event) {
        Object.keys(listenersLists).forEach(ev => instance.off(ev));
      } else {
        const list = listenersLists[event] || [];
        listenersLists[event] = listeners.length ? list.filter(listener => !listeners.includes(listener)) : [];
      }
      return instance;
    }
  };
  return instance;
}

function proxyListener (eventMap) {
  return function ({emitter}) {

    const proxy = {};
    let eventListeners = {};

    for (let ev of Object.keys(eventMap)) {
      const method = eventMap[ev];
      eventListeners[ev] = [];
      proxy[method] = function (...listeners) {
        eventListeners[ev] = eventListeners[ev].concat(listeners);
        emitter.on(ev, ...listeners);
        return proxy;
      };
    }

    return Object.assign(proxy, {
      off(ev){
        if (!ev) {
          Object.keys(eventListeners).forEach(eventName => proxy.off(eventName));
        }
        if (eventListeners[ev]) {
          emitter.off(ev, ...eventListeners[ev]);
        }
        return proxy;
      }
    });
  }
}

const TOGGLE_SORT = 'TOGGLE_SORT';
const DISPLAY_CHANGED = 'DISPLAY_CHANGED';
const PAGE_CHANGED = 'CHANGE_PAGE';
const EXEC_CHANGED = 'EXEC_CHANGED';
const FILTER_CHANGED = 'FILTER_CHANGED';
const SUMMARY_CHANGED = 'SUMMARY_CHANGED';
const SEARCH_CHANGED = 'SEARCH_CHANGED';
const EXEC_ERROR = 'EXEC_ERROR';

function curriedPointer (path) {
  const {get, set} = pointer(path);
  return {get, set: curry(set)};
}

var table$2 = function ({
  sortFactory,
  tableState,
  data,
  filterFactory,
  searchFactory
}) {
  const table = emitter();
  const sortPointer = curriedPointer('sort');
  const slicePointer = curriedPointer('slice');
  const filterPointer = curriedPointer('filter');
  const searchPointer = curriedPointer('search');

  const safeAssign = curry((base, extension) => Object.assign({}, base, extension));
  const dispatch = curry(table.dispatch.bind(table), 2);

  const dispatchSummary = (filtered) => {
    dispatch(SUMMARY_CHANGED, {
      page: tableState.slice.page,
      size: tableState.slice.size,
      filteredCount: filtered.length
    });
  };

  const exec = ({processingDelay = 20} = {}) => {
    table.dispatch(EXEC_CHANGED, {working: true});
    setTimeout(function () {
      try {
        const filterFunc = filterFactory(filterPointer.get(tableState));
        const searchFunc = searchFactory(searchPointer.get(tableState));
        const sortFunc = sortFactory(sortPointer.get(tableState));
        const sliceFunc = sliceFactory(slicePointer.get(tableState));
        const execFunc = compose(filterFunc, searchFunc, tap(dispatchSummary), sortFunc, sliceFunc);
        const displayed = execFunc(data);
        table.dispatch(DISPLAY_CHANGED, displayed.map(d => {
          return {index: data.indexOf(d), value: d};
        }));
      } catch (e) {
        table.dispatch(EXEC_ERROR, e);
      } finally {
        table.dispatch(EXEC_CHANGED, {working: false});
      }
    }, processingDelay);
  };

  const updateTableState = curry((pter, ev, newPartialState) => compose(
    safeAssign(pter.get(tableState)),
    tap(dispatch(ev)),
    pter.set(tableState)
  )(newPartialState));

  const resetToFirstPage = () => updateTableState(slicePointer, PAGE_CHANGED, {page: 1});

  const tableOperation = (pter, ev) => compose(
    updateTableState(pter, ev),
    resetToFirstPage,
    () => table.exec() // we wrap within a function so table.exec can be overwritten (when using with a server for example)
  );

  const api = {
    sort: tableOperation(sortPointer, TOGGLE_SORT),
    filter: tableOperation(filterPointer, FILTER_CHANGED),
    search: tableOperation(searchPointer, SEARCH_CHANGED),
    slice: compose(updateTableState(slicePointer, PAGE_CHANGED), () => table.exec()),
    exec,
    eval(state = tableState){
      return Promise.resolve()
        .then(function () {
          const sortFunc = sortFactory(sortPointer.get(state));
          const searchFunc = searchFactory(searchPointer.get(state));
          const filterFunc = filterFactory(filterPointer.get(state));
          const sliceFunc = sliceFactory(slicePointer.get(state));
          const execFunc = compose(filterFunc, searchFunc, sortFunc, sliceFunc);
          return execFunc(data).map(d => {
            return {index: data.indexOf(d), value: d}
          });
        });
    },
    onDisplayChange(fn){
      table.on(DISPLAY_CHANGED, fn);
    },
    getTableState(){
      const sort = Object.assign({}, tableState.sort);
      const search = Object.assign({}, tableState.search);
      const slice = Object.assign({}, tableState.slice);
      const filter = {};
      for (let prop in tableState.filter) {
        filter[prop] = tableState.filter[prop].map(v => Object.assign({}, v));
      }
      return {sort, search, slice, filter};
    }
  };

  const instance = Object.assign(table, api);

  Object.defineProperty(instance, 'length', {
    get(){
      return data.length;
    }
  });

  return instance;
};

var tableDirective$1 = function ({
  sortFactory: sortFactory$$1 = sortFactory,
  filterFactory = filter$1,
  searchFactory = search$1,
  tableState = {sort: {}, slice: {page: 1}, filter: {}, search: {}},
  data = []
}, ...tableDirectives) {

  const coreTable = table$2({sortFactory: sortFactory$$1, filterFactory, tableState, data, searchFactory});

  return tableDirectives.reduce((accumulator, newdir) => {
    return Object.assign(accumulator, newdir({
      sortFactory: sortFactory$$1,
      filterFactory,
      searchFactory,
      tableState,
      data,
      table: coreTable
    }));
  }, coreTable);
};

const filterListener = proxyListener({[FILTER_CHANGED]: 'onFilterChange'});

var filterDirective = function ({table, pointer, operator = 'includes', type = 'string'}) {
  return Object.assign({
      filter(input){
        const filterConf = {
          [pointer]: [
            {
              value: input,
              operator,
              type
            }
          ]

        };
        return table.filter(filterConf);
      }
    },
    filterListener({emitter: table}));
};

const searchListener = proxyListener({[SEARCH_CHANGED]: 'onSearchChange'});

var searchDirective = function ({table, scope = []}) {
  return Object.assign(
    searchListener({emitter: table}), {
      search(input){
        return table.search({value: input, scope});
      }
    });
};

const sliceListener = proxyListener({[PAGE_CHANGED]: 'onPageChange', [SUMMARY_CHANGED]: 'onSummaryChange'});

var sliceDirective = function ({table}) {
  let {slice:{page:currentPage, size:currentSize}} = table.getTableState();
  let itemListLength = table.length;

  const api = {
    selectPage(p){
      return table.slice({page: p, size: currentSize});
    },
    selectNextPage(){
      return api.selectPage(currentPage + 1);
    },
    selectPreviousPage(){
      return api.selectPage(currentPage - 1);
    },
    changePageSize(size){
      return table.slice({page: 1, size});
    },
    isPreviousPageEnabled(){
      return currentPage > 1;
    },
    isNextPageEnabled(){
      return Math.ceil(itemListLength / currentSize) > currentPage;
    }
  };
  const directive = Object.assign(api, sliceListener({emitter: table}));

  directive.onSummaryChange(({page:p, size:s, filteredCount}) => {
    currentPage = p;
    currentSize = s;
    itemListLength = filteredCount;
  });

  return directive;
};

const sortListeners = proxyListener({[TOGGLE_SORT]: 'onSortToggle'});
const directions = ['asc', 'desc'];

var sortDirective = function ({pointer, table, cycle = false}) {

  const cycleDirections = cycle === true ? ['none'].concat(directions) : [...directions].reverse();

  let hit = 0;

  const directive = Object.assign({
    toggle(){
      hit++;
      const direction = cycleDirections[hit % cycleDirections.length];
      return table.sort({pointer, direction});
    }

  }, sortListeners({emitter: table}));

  directive.onSortToggle(({pointer:p}) => {
    if (pointer !== p) {
      hit = 0;
    }
  });

  return directive;
};

const executionListener = proxyListener({[SUMMARY_CHANGED]: 'onSummaryChange'});

var summaryDirective$1 = function ({table}) {
  return executionListener({emitter: table});
};

const executionListener$1 = proxyListener({[EXEC_CHANGED]: 'onExecutionChange'});

var workingIndicatorDirective = function ({table}) {
  return executionListener$1({emitter: table});
};

const search = searchDirective;
const slice = sliceDirective;
const summary = summaryDirective$1;
const sort = sortDirective;
const filter = filterDirective;
const workingIndicator = workingIndicatorDirective;
const table = tableDirective$1;

var loading = function ({table: table$$1, el}) {
  const component = workingIndicator({table: table$$1});
  component.onExecutionChange(function ({working}) {
    el.classList.remove('st-working');
    if (working === true) {
      el.classList.add('st-working');
    }
  });
  return component;
};

var sort$1 = function ({el, table: table$$1, conf = {}}) {
  const pointer = conf.pointer || el.getAttribute('data-st-sort');
  const cycle = conf.cycle || el.hasAttribute('data-st-sort-cycle');
  const component = sort({pointer, table: table$$1, cycle});
  component.onSortToggle(({pointer:currentPointer, direction}) => {
    el.classList.remove('st-sort-asc', 'st-sort-desc');
    if (pointer === currentPointer && direction !== 'none') {
      const className = direction === 'asc' ? 'st-sort-asc' : 'st-sort-desc';
      el.classList.add(className);
    }
  });
  const eventListener = ev => component.toggle();
  el.addEventListener('click', eventListener);
  return component;
};

function debounce (fn, delay) {
  let timeoutId;
  return (ev) => {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(function () {
      fn(ev);
    }, delay);
  };
}

function filterInput ({table: table$$1, el, delay = 400, conf = {}}) {
  const pointer = conf.pointer || el.getAttribute('data-st-filter');
  const operator = conf.operator || el.getAttribute('data-st-filter-operator') || 'includes';
  const elType = el.hasAttribute('type') ? el.getAttribute('type') : 'string';
  let type = conf.type || el.getAttribute('data-st-filter-type');
  if (!type) {
    type = ['date', 'number'].includes(elType) ? elType : 'string';
  }
  const component = filter({table: table$$1, pointer, type, operator});
  const eventListener = debounce(ev => component.filter(el.value), delay);
  el.addEventListener('input', eventListener);
  if (el.tagName === 'SELECT') {
    el.addEventListener('change', eventListener);
  }
  return component;
}

var searchInput = function ({el, table: table$$1, delay = 400, conf = {}}) {
  const scope = conf.scope || (el.getAttribute('data-st-search') || '').split(',').map(s => s.trim());
  const component = search({table: table$$1, scope});
  const eventListener = debounce(ev => {
    component.search(el.value);
  }, delay);
  el.addEventListener('input', eventListener);
};

var tableComponentFactory = function ({el, table}) {
  // boot
  [...el.querySelectorAll('[data-st-sort]')].forEach(el => sort$1({el, table}));
  [...el.querySelectorAll('[data-st-loading-indicator]')].forEach(el => loading({el, table}));
  [...el.querySelectorAll('[data-st-search]')].forEach(el => searchInput({el, table}));
  [...el.querySelectorAll('[data-st-filter]')].forEach(el => filterInput({el, table}));

  //extension
  const tableDisplayChange = table.onDisplayChange;
  return Object.assign(table, {
    onDisplayChange: (listener) => {
      tableDisplayChange(listener);
      table.exec();
    }
  });
};

var row = function ({name:{first:firstName, last:lastName}, gender, birthDate, size}) {
  const tr = document.createElement('tr');
  tr.innerHTML = `<td>${lastName}</td><td>${firstName}</td><td>${gender}</td><td>${birthDate.toLocaleDateString()}</td><td>${size}</td>`;
  return tr;
};

function summaryComponent ({table: table$$1, el}) {
  const dir = summary({table: table$$1});
  dir.onSummaryChange(({page, size, filteredCount}) => {
    el.innerHTML = `showing items <strong>${(page - 1) * size + (filteredCount > 0 ? 1 : 0)}</strong> - <strong>${Math.min(filteredCount, page * size)}</strong> of <strong>${filteredCount}</strong> matching items`;
  });
  return dir;
}

function paginationComponent ({table: table$$1, el}) {
  const previousButton = document.createElement('button');
  previousButton.innerHTML = 'Previous';
  const nextButton = document.createElement('button');
  nextButton.innerHTML = 'Next';
  const pageSpan = document.createElement('span');
  pageSpan.innerHTML = '- page 1 -';
  const comp = slice({table: table$$1});

  comp.onSummaryChange(({page}) => {
    previousButton.disabled = !comp.isPreviousPageEnabled();
    nextButton.disabled = !comp.isNextPageEnabled();
    pageSpan.innerHTML = `- ${page} -`;
  });

  previousButton.addEventListener('click', () => comp.selectPreviousPage());
  nextButton.addEventListener('click', () => comp.selectNextPage());

  el.appendChild(previousButton);
  el.appendChild(pageSpan);
  el.appendChild(nextButton);

  return comp;
}

function rangSizeInput ({minEl, maxEl, table: table$$1}) {

  let ltValue;
  let gtValue;

  const commit = () => {
    const clauses = [];
    if (ltValue) {
      clauses.push({value: ltValue, operator: 'lte', type: 'number'});
    }
    if (gtValue) {
      clauses.push({value: gtValue, operator: 'gte', type: 'number'});
    }
    table$$1.filter({
      size: clauses
    });
  };

  minEl.addEventListener('input', debounce((ev) => {
    gtValue = minEl.value;
    commit();
  }, 400));

  maxEl.addEventListener('input', debounce((ev) => {
    ltValue = maxEl.value;
    commit();
  }, 400));
}

var ext = ({query}) => ({table, tableState}) => {
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

//a fake sdk to mimic a server: it actually uses another smart-table to process a query and return the result with a random timeout to mimic the http response time
var sdk = () => {
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
        }, 20);
      });
    }
  };
};

const el = document.getElementById('table-container');
const tbody = el.querySelector('tbody');
const summaryEl = el.querySelector('[data-st-summary]');

const t = table(
  {tableState: {sort: {}, filter: {}, slice: {page: 1, size: 20}}},
  ext(sdk()) //server side extension
);
const tableComponent = tableComponentFactory({el, table: t});

summaryComponent({table: t, el: summaryEl});
rangSizeInput({
  table: t,
  minEl: document.getElementById('min-size'),
  maxEl: document.getElementById('max-size')
});

const paginationContainer = el.querySelector('[data-st-pagination]');
paginationComponent({table: t, el: paginationContainer});

tableComponent.onDisplayChange(displayed => {
  tbody.innerHTML = '';
  for (let r of displayed) {
    const newChild = row((r.value), r.index, t);
    tbody.appendChild(newChild);
  }
});

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlcyI6WyIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtb3BlcmF0b3JzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWpzb24tcG9pbnRlci9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1zb3J0L2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWZpbHRlci9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1zZWFyY2gvaW5kZXguanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtY29yZS9zcmMvc2xpY2UuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtZXZlbnRzL2luZGV4LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL2V2ZW50cy5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1jb3JlL3NyYy9kaXJlY3RpdmVzL3RhYmxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL3RhYmxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL2RpcmVjdGl2ZXMvZmlsdGVyLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL2RpcmVjdGl2ZXMvc2VhcmNoLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL2RpcmVjdGl2ZXMvc2xpY2UuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtY29yZS9zcmMvZGlyZWN0aXZlcy9zb3J0LmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvc3JjL2RpcmVjdGl2ZXMvc3VtbWFyeS5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1jb3JlL3NyYy9kaXJlY3RpdmVzL3dvcmtpbmdJbmRpY2F0b3IuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtY29yZS9pbmRleC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS12YW5pbGxhL2xpYi9sb2FkaW5nSW5kaWNhdG9yLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLXZhbmlsbGEvbGliL3NvcnQuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtdmFuaWxsYS9saWIvaGVscGVycy5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS12YW5pbGxhL2xpYi9maWx0ZXJzLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLXZhbmlsbGEvbGliL3NlYXJjaC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS12YW5pbGxhL2xpYi90YWJsZS5qcyIsImNvbXBvbmVudHMvcm93LmpzIiwiY29tcG9uZW50cy9zdW1tYXJ5LmpzIiwiY29tcG9uZW50cy9wYWdpbmF0aW9uLmpzIiwiY29tcG9uZW50cy9yYW5nZVNpemVJbnB1dC5qcyIsIi4uL2luZGV4LmpzIiwic2RrLmpzIiwiaW5kZXguanMiXSwic291cmNlc0NvbnRlbnQiOlsiZXhwb3J0IGZ1bmN0aW9uIHN3YXAgKGYpIHtcbiAgcmV0dXJuIChhLCBiKSA9PiBmKGIsIGEpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29tcG9zZSAoZmlyc3QsIC4uLmZucykge1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IGZucy5yZWR1Y2UoKHByZXZpb3VzLCBjdXJyZW50KSA9PiBjdXJyZW50KHByZXZpb3VzKSwgZmlyc3QoLi4uYXJncykpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3VycnkgKGZuLCBhcml0eUxlZnQpIHtcbiAgY29uc3QgYXJpdHkgPSBhcml0eUxlZnQgfHwgZm4ubGVuZ3RoO1xuICByZXR1cm4gKC4uLmFyZ3MpID0+IHtcbiAgICBjb25zdCBhcmdMZW5ndGggPSBhcmdzLmxlbmd0aCB8fCAxO1xuICAgIGlmIChhcml0eSA9PT0gYXJnTGVuZ3RoKSB7XG4gICAgICByZXR1cm4gZm4oLi4uYXJncyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IGZ1bmMgPSAoLi4ubW9yZUFyZ3MpID0+IGZuKC4uLmFyZ3MsIC4uLm1vcmVBcmdzKTtcbiAgICAgIHJldHVybiBjdXJyeShmdW5jLCBhcml0eSAtIGFyZ3MubGVuZ3RoKTtcbiAgICB9XG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhcHBseSAoZm4pIHtcbiAgcmV0dXJuICguLi5hcmdzKSA9PiBmbiguLi5hcmdzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRhcCAoZm4pIHtcbiAgcmV0dXJuIGFyZyA9PiB7XG4gICAgZm4oYXJnKTtcbiAgICByZXR1cm4gYXJnO1xuICB9XG59IiwiZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gcG9pbnRlciAocGF0aCkge1xuXG4gIGNvbnN0IHBhcnRzID0gcGF0aC5zcGxpdCgnLicpO1xuXG4gIGZ1bmN0aW9uIHBhcnRpYWwgKG9iaiA9IHt9LCBwYXJ0cyA9IFtdKSB7XG4gICAgY29uc3QgcCA9IHBhcnRzLnNoaWZ0KCk7XG4gICAgY29uc3QgY3VycmVudCA9IG9ialtwXTtcbiAgICByZXR1cm4gKGN1cnJlbnQgPT09IHVuZGVmaW5lZCB8fCBwYXJ0cy5sZW5ndGggPT09IDApID9cbiAgICAgIGN1cnJlbnQgOiBwYXJ0aWFsKGN1cnJlbnQsIHBhcnRzKTtcbiAgfVxuXG4gIGZ1bmN0aW9uIHNldCAodGFyZ2V0LCBuZXdUcmVlKSB7XG4gICAgbGV0IGN1cnJlbnQgPSB0YXJnZXQ7XG4gICAgY29uc3QgW2xlYWYsIC4uLmludGVybWVkaWF0ZV0gPSBwYXJ0cy5yZXZlcnNlKCk7XG4gICAgZm9yIChsZXQga2V5IG9mIGludGVybWVkaWF0ZS5yZXZlcnNlKCkpIHtcbiAgICAgIGlmIChjdXJyZW50W2tleV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjdXJyZW50W2tleV0gPSB7fTtcbiAgICAgICAgY3VycmVudCA9IGN1cnJlbnRba2V5XTtcbiAgICAgIH1cbiAgICB9XG4gICAgY3VycmVudFtsZWFmXSA9IE9iamVjdC5hc3NpZ24oY3VycmVudFtsZWFmXSB8fCB7fSwgbmV3VHJlZSk7XG4gICAgcmV0dXJuIHRhcmdldDtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgZ2V0KHRhcmdldCl7XG4gICAgICByZXR1cm4gcGFydGlhbCh0YXJnZXQsIFsuLi5wYXJ0c10pXG4gICAgfSxcbiAgICBzZXRcbiAgfVxufTtcbiIsImltcG9ydCB7c3dhcH0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcbmltcG9ydCBwb2ludGVyIGZyb20gJ3NtYXJ0LXRhYmxlLWpzb24tcG9pbnRlcic7XG5cblxuZnVuY3Rpb24gc29ydEJ5UHJvcGVydHkgKHByb3ApIHtcbiAgY29uc3QgcHJvcEdldHRlciA9IHBvaW50ZXIocHJvcCkuZ2V0O1xuICByZXR1cm4gKGEsIGIpID0+IHtcbiAgICBjb25zdCBhVmFsID0gcHJvcEdldHRlcihhKTtcbiAgICBjb25zdCBiVmFsID0gcHJvcEdldHRlcihiKTtcblxuICAgIGlmIChhVmFsID09PSBiVmFsKSB7XG4gICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICBpZiAoYlZhbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICByZXR1cm4gLTE7XG4gICAgfVxuXG4gICAgaWYgKGFWYWwgPT09IHVuZGVmaW5lZCkge1xuICAgICAgcmV0dXJuIDE7XG4gICAgfVxuXG4gICAgcmV0dXJuIGFWYWwgPCBiVmFsID8gLTEgOiAxO1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHNvcnRGYWN0b3J5ICh7cG9pbnRlciwgZGlyZWN0aW9ufSA9IHt9KSB7XG4gIGlmICghcG9pbnRlciB8fCBkaXJlY3Rpb24gPT09ICdub25lJykge1xuICAgIHJldHVybiBhcnJheSA9PiBbLi4uYXJyYXldO1xuICB9XG5cbiAgY29uc3Qgb3JkZXJGdW5jID0gc29ydEJ5UHJvcGVydHkocG9pbnRlcik7XG4gIGNvbnN0IGNvbXBhcmVGdW5jID0gZGlyZWN0aW9uID09PSAnZGVzYycgPyBzd2FwKG9yZGVyRnVuYykgOiBvcmRlckZ1bmM7XG5cbiAgcmV0dXJuIChhcnJheSkgPT4gWy4uLmFycmF5XS5zb3J0KGNvbXBhcmVGdW5jKTtcbn0iLCJpbXBvcnQge2NvbXBvc2V9IGZyb20gJ3NtYXJ0LXRhYmxlLW9wZXJhdG9ycyc7XG5pbXBvcnQgcG9pbnRlciBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuXG5mdW5jdGlvbiB0eXBlRXhwcmVzc2lvbiAodHlwZSkge1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiBCb29sZWFuO1xuICAgIGNhc2UgJ251bWJlcic6XG4gICAgICByZXR1cm4gTnVtYmVyO1xuICAgIGNhc2UgJ2RhdGUnOlxuICAgICAgcmV0dXJuICh2YWwpID0+IG5ldyBEYXRlKHZhbCk7XG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiBjb21wb3NlKFN0cmluZywgKHZhbCkgPT4gdmFsLnRvTG93ZXJDYXNlKCkpO1xuICB9XG59XG5cbmNvbnN0IG9wZXJhdG9ycyA9IHtcbiAgaW5jbHVkZXModmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0LmluY2x1ZGVzKHZhbHVlKTtcbiAgfSxcbiAgaXModmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IE9iamVjdC5pcyh2YWx1ZSwgaW5wdXQpO1xuICB9LFxuICBpc05vdCh2YWx1ZSl7XG4gICAgcmV0dXJuIChpbnB1dCkgPT4gIU9iamVjdC5pcyh2YWx1ZSwgaW5wdXQpO1xuICB9LFxuICBsdCh2YWx1ZSl7XG4gICAgcmV0dXJuIChpbnB1dCkgPT4gaW5wdXQgPCB2YWx1ZTtcbiAgfSxcbiAgZ3QodmFsdWUpe1xuICAgIHJldHVybiAoaW5wdXQpID0+IGlucHV0ID4gdmFsdWU7XG4gIH0sXG4gIGx0ZSh2YWx1ZSl7XG4gICAgcmV0dXJuIChpbnB1dCkgPT4gaW5wdXQgPD0gdmFsdWU7XG4gIH0sXG4gIGd0ZSh2YWx1ZSl7XG4gICAgcmV0dXJuIChpbnB1dCkgPT4gaW5wdXQgPj0gdmFsdWU7XG4gIH0sXG4gIGVxdWFscyh2YWx1ZSl7XG4gICAgcmV0dXJuIChpbnB1dCkgPT4gdmFsdWUgPT0gaW5wdXQ7XG4gIH0sXG4gIG5vdEVxdWFscyh2YWx1ZSl7XG4gICAgcmV0dXJuIChpbnB1dCkgPT4gdmFsdWUgIT0gaW5wdXQ7XG4gIH1cbn07XG5cbmNvbnN0IGV2ZXJ5ID0gZm5zID0+ICguLi5hcmdzKSA9PiBmbnMuZXZlcnkoZm4gPT4gZm4oLi4uYXJncykpO1xuXG5leHBvcnQgZnVuY3Rpb24gcHJlZGljYXRlICh7dmFsdWUgPSAnJywgb3BlcmF0b3IgPSAnaW5jbHVkZXMnLCB0eXBlID0gJ3N0cmluZyd9KSB7XG4gIGNvbnN0IHR5cGVJdCA9IHR5cGVFeHByZXNzaW9uKHR5cGUpO1xuICBjb25zdCBvcGVyYXRlT25UeXBlZCA9IGNvbXBvc2UodHlwZUl0LCBvcGVyYXRvcnNbb3BlcmF0b3JdKTtcbiAgY29uc3QgcHJlZGljYXRlRnVuYyA9IG9wZXJhdGVPblR5cGVkKHZhbHVlKTtcbiAgcmV0dXJuIGNvbXBvc2UodHlwZUl0LCBwcmVkaWNhdGVGdW5jKTtcbn1cblxuLy9hdm9pZCB1c2VsZXNzIGZpbHRlciBsb29rdXAgKGltcHJvdmUgcGVyZilcbmZ1bmN0aW9uIG5vcm1hbGl6ZUNsYXVzZXMgKGNvbmYpIHtcbiAgY29uc3Qgb3V0cHV0ID0ge307XG4gIGNvbnN0IHZhbGlkUGF0aCA9IE9iamVjdC5rZXlzKGNvbmYpLmZpbHRlcihwYXRoID0+IEFycmF5LmlzQXJyYXkoY29uZltwYXRoXSkpO1xuICB2YWxpZFBhdGguZm9yRWFjaChwYXRoID0+IHtcbiAgICBjb25zdCB2YWxpZENsYXVzZXMgPSBjb25mW3BhdGhdLmZpbHRlcihjID0+IGMudmFsdWUgIT09ICcnKTtcbiAgICBpZiAodmFsaWRDbGF1c2VzLmxlbmd0aCkge1xuICAgICAgb3V0cHV0W3BhdGhdID0gdmFsaWRDbGF1c2VzO1xuICAgIH1cbiAgfSk7XG4gIHJldHVybiBvdXRwdXQ7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGZpbHRlciAoZmlsdGVyKSB7XG4gIGNvbnN0IG5vcm1hbGl6ZWRDbGF1c2VzID0gbm9ybWFsaXplQ2xhdXNlcyhmaWx0ZXIpO1xuICBjb25zdCBmdW5jTGlzdCA9IE9iamVjdC5rZXlzKG5vcm1hbGl6ZWRDbGF1c2VzKS5tYXAocGF0aCA9PiB7XG4gICAgY29uc3QgZ2V0dGVyID0gcG9pbnRlcihwYXRoKS5nZXQ7XG4gICAgY29uc3QgY2xhdXNlcyA9IG5vcm1hbGl6ZWRDbGF1c2VzW3BhdGhdLm1hcChwcmVkaWNhdGUpO1xuICAgIHJldHVybiBjb21wb3NlKGdldHRlciwgZXZlcnkoY2xhdXNlcykpO1xuICB9KTtcbiAgY29uc3QgZmlsdGVyUHJlZGljYXRlID0gZXZlcnkoZnVuY0xpc3QpO1xuXG4gIHJldHVybiAoYXJyYXkpID0+IGFycmF5LmZpbHRlcihmaWx0ZXJQcmVkaWNhdGUpO1xufSIsImltcG9ydCBwb2ludGVyIGZyb20gJ3NtYXJ0LXRhYmxlLWpzb24tcG9pbnRlcic7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIChzZWFyY2hDb25mID0ge30pIHtcbiAgY29uc3Qge3ZhbHVlLCBzY29wZSA9IFtdfSA9IHNlYXJjaENvbmY7XG4gIGNvbnN0IHNlYXJjaFBvaW50ZXJzID0gc2NvcGUubWFwKGZpZWxkID0+IHBvaW50ZXIoZmllbGQpLmdldCk7XG4gIGlmICghc2NvcGUubGVuZ3RoIHx8ICF2YWx1ZSkge1xuICAgIHJldHVybiBhcnJheSA9PiBhcnJheTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gYXJyYXkgPT4gYXJyYXkuZmlsdGVyKGl0ZW0gPT4gc2VhcmNoUG9pbnRlcnMuc29tZShwID0+IFN0cmluZyhwKGl0ZW0pKS5pbmNsdWRlcyhTdHJpbmcodmFsdWUpKSkpXG4gIH1cbn0iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBzbGljZUZhY3RvcnkgKHtwYWdlID0gMSwgc2l6ZX0gPSB7fSkge1xuICByZXR1cm4gZnVuY3Rpb24gc2xpY2VGdW5jdGlvbiAoYXJyYXkgPSBbXSkge1xuICAgIGNvbnN0IGFjdHVhbFNpemUgPSBzaXplIHx8IGFycmF5Lmxlbmd0aDtcbiAgICBjb25zdCBvZmZzZXQgPSAocGFnZSAtIDEpICogYWN0dWFsU2l6ZTtcbiAgICByZXR1cm4gYXJyYXkuc2xpY2Uob2Zmc2V0LCBvZmZzZXQgKyBhY3R1YWxTaXplKTtcbiAgfTtcbn1cbiIsImV4cG9ydCBmdW5jdGlvbiBlbWl0dGVyICgpIHtcblxuICBjb25zdCBsaXN0ZW5lcnNMaXN0cyA9IHt9O1xuICBjb25zdCBpbnN0YW5jZSA9IHtcbiAgICBvbihldmVudCwgLi4ubGlzdGVuZXJzKXtcbiAgICAgIGxpc3RlbmVyc0xpc3RzW2V2ZW50XSA9IChsaXN0ZW5lcnNMaXN0c1tldmVudF0gfHwgW10pLmNvbmNhdChsaXN0ZW5lcnMpO1xuICAgICAgcmV0dXJuIGluc3RhbmNlO1xuICAgIH0sXG4gICAgZGlzcGF0Y2goZXZlbnQsIC4uLmFyZ3Mpe1xuICAgICAgY29uc3QgbGlzdGVuZXJzID0gbGlzdGVuZXJzTGlzdHNbZXZlbnRdIHx8IFtdO1xuICAgICAgZm9yIChsZXQgbGlzdGVuZXIgb2YgbGlzdGVuZXJzKSB7XG4gICAgICAgIGxpc3RlbmVyKC4uLmFyZ3MpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGluc3RhbmNlO1xuICAgIH0sXG4gICAgb2ZmKGV2ZW50LCAuLi5saXN0ZW5lcnMpe1xuICAgICAgaWYgKCFldmVudCkge1xuICAgICAgICBPYmplY3Qua2V5cyhsaXN0ZW5lcnNMaXN0cykuZm9yRWFjaChldiA9PiBpbnN0YW5jZS5vZmYoZXYpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGxpc3QgPSBsaXN0ZW5lcnNMaXN0c1tldmVudF0gfHwgW107XG4gICAgICAgIGxpc3RlbmVyc0xpc3RzW2V2ZW50XSA9IGxpc3RlbmVycy5sZW5ndGggPyBsaXN0LmZpbHRlcihsaXN0ZW5lciA9PiAhbGlzdGVuZXJzLmluY2x1ZGVzKGxpc3RlbmVyKSkgOiBbXTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBpbnN0YW5jZTtcbiAgICB9XG4gIH07XG4gIHJldHVybiBpbnN0YW5jZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3h5TGlzdGVuZXIgKGV2ZW50TWFwKSB7XG4gIHJldHVybiBmdW5jdGlvbiAoe2VtaXR0ZXJ9KSB7XG5cbiAgICBjb25zdCBwcm94eSA9IHt9O1xuICAgIGxldCBldmVudExpc3RlbmVycyA9IHt9O1xuXG4gICAgZm9yIChsZXQgZXYgb2YgT2JqZWN0LmtleXMoZXZlbnRNYXApKSB7XG4gICAgICBjb25zdCBtZXRob2QgPSBldmVudE1hcFtldl07XG4gICAgICBldmVudExpc3RlbmVyc1tldl0gPSBbXTtcbiAgICAgIHByb3h5W21ldGhvZF0gPSBmdW5jdGlvbiAoLi4ubGlzdGVuZXJzKSB7XG4gICAgICAgIGV2ZW50TGlzdGVuZXJzW2V2XSA9IGV2ZW50TGlzdGVuZXJzW2V2XS5jb25jYXQobGlzdGVuZXJzKTtcbiAgICAgICAgZW1pdHRlci5vbihldiwgLi4ubGlzdGVuZXJzKTtcbiAgICAgICAgcmV0dXJuIHByb3h5O1xuICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gT2JqZWN0LmFzc2lnbihwcm94eSwge1xuICAgICAgb2ZmKGV2KXtcbiAgICAgICAgaWYgKCFldikge1xuICAgICAgICAgIE9iamVjdC5rZXlzKGV2ZW50TGlzdGVuZXJzKS5mb3JFYWNoKGV2ZW50TmFtZSA9PiBwcm94eS5vZmYoZXZlbnROYW1lKSk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKGV2ZW50TGlzdGVuZXJzW2V2XSkge1xuICAgICAgICAgIGVtaXR0ZXIub2ZmKGV2LCAuLi5ldmVudExpc3RlbmVyc1tldl0pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBwcm94eTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufSIsImV4cG9ydCBjb25zdCBUT0dHTEVfU09SVCA9ICdUT0dHTEVfU09SVCc7XG5leHBvcnQgY29uc3QgRElTUExBWV9DSEFOR0VEID0gJ0RJU1BMQVlfQ0hBTkdFRCc7XG5leHBvcnQgY29uc3QgUEFHRV9DSEFOR0VEID0gJ0NIQU5HRV9QQUdFJztcbmV4cG9ydCBjb25zdCBFWEVDX0NIQU5HRUQgPSAnRVhFQ19DSEFOR0VEJztcbmV4cG9ydCBjb25zdCBGSUxURVJfQ0hBTkdFRCA9ICdGSUxURVJfQ0hBTkdFRCc7XG5leHBvcnQgY29uc3QgU1VNTUFSWV9DSEFOR0VEID0gJ1NVTU1BUllfQ0hBTkdFRCc7XG5leHBvcnQgY29uc3QgU0VBUkNIX0NIQU5HRUQgPSAnU0VBUkNIX0NIQU5HRUQnO1xuZXhwb3J0IGNvbnN0IEVYRUNfRVJST1IgPSAnRVhFQ19FUlJPUic7IiwiaW1wb3J0IHNsaWNlIGZyb20gJy4uL3NsaWNlJztcbmltcG9ydCB7Y3VycnksIHRhcCwgY29tcG9zZX0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcbmltcG9ydCBwb2ludGVyIGZyb20gJ3NtYXJ0LXRhYmxlLWpzb24tcG9pbnRlcic7XG5pbXBvcnQge2VtaXR0ZXJ9IGZyb20gJ3NtYXJ0LXRhYmxlLWV2ZW50cyc7XG5pbXBvcnQgc2xpY2VGYWN0b3J5IGZyb20gJy4uL3NsaWNlJztcbmltcG9ydCB7XG4gIFNVTU1BUllfQ0hBTkdFRCxcbiAgVE9HR0xFX1NPUlQsXG4gIERJU1BMQVlfQ0hBTkdFRCxcbiAgUEFHRV9DSEFOR0VELFxuICBFWEVDX0NIQU5HRUQsXG4gIEZJTFRFUl9DSEFOR0VELFxuICBTRUFSQ0hfQ0hBTkdFRCxcbiAgRVhFQ19FUlJPUlxufSBmcm9tICcuLi9ldmVudHMnO1xuXG5mdW5jdGlvbiBjdXJyaWVkUG9pbnRlciAocGF0aCkge1xuICBjb25zdCB7Z2V0LCBzZXR9ID0gcG9pbnRlcihwYXRoKTtcbiAgcmV0dXJuIHtnZXQsIHNldDogY3Vycnkoc2V0KX07XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uICh7XG4gIHNvcnRGYWN0b3J5LFxuICB0YWJsZVN0YXRlLFxuICBkYXRhLFxuICBmaWx0ZXJGYWN0b3J5LFxuICBzZWFyY2hGYWN0b3J5XG59KSB7XG4gIGNvbnN0IHRhYmxlID0gZW1pdHRlcigpO1xuICBjb25zdCBzb3J0UG9pbnRlciA9IGN1cnJpZWRQb2ludGVyKCdzb3J0Jyk7XG4gIGNvbnN0IHNsaWNlUG9pbnRlciA9IGN1cnJpZWRQb2ludGVyKCdzbGljZScpO1xuICBjb25zdCBmaWx0ZXJQb2ludGVyID0gY3VycmllZFBvaW50ZXIoJ2ZpbHRlcicpO1xuICBjb25zdCBzZWFyY2hQb2ludGVyID0gY3VycmllZFBvaW50ZXIoJ3NlYXJjaCcpO1xuXG4gIGNvbnN0IHNhZmVBc3NpZ24gPSBjdXJyeSgoYmFzZSwgZXh0ZW5zaW9uKSA9PiBPYmplY3QuYXNzaWduKHt9LCBiYXNlLCBleHRlbnNpb24pKTtcbiAgY29uc3QgZGlzcGF0Y2ggPSBjdXJyeSh0YWJsZS5kaXNwYXRjaC5iaW5kKHRhYmxlKSwgMik7XG5cbiAgY29uc3QgZGlzcGF0Y2hTdW1tYXJ5ID0gKGZpbHRlcmVkKSA9PiB7XG4gICAgZGlzcGF0Y2goU1VNTUFSWV9DSEFOR0VELCB7XG4gICAgICBwYWdlOiB0YWJsZVN0YXRlLnNsaWNlLnBhZ2UsXG4gICAgICBzaXplOiB0YWJsZVN0YXRlLnNsaWNlLnNpemUsXG4gICAgICBmaWx0ZXJlZENvdW50OiBmaWx0ZXJlZC5sZW5ndGhcbiAgICB9KTtcbiAgfTtcblxuICBjb25zdCBleGVjID0gKHtwcm9jZXNzaW5nRGVsYXkgPSAyMH0gPSB7fSkgPT4ge1xuICAgIHRhYmxlLmRpc3BhdGNoKEVYRUNfQ0hBTkdFRCwge3dvcmtpbmc6IHRydWV9KTtcbiAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGZpbHRlckZ1bmMgPSBmaWx0ZXJGYWN0b3J5KGZpbHRlclBvaW50ZXIuZ2V0KHRhYmxlU3RhdGUpKTtcbiAgICAgICAgY29uc3Qgc2VhcmNoRnVuYyA9IHNlYXJjaEZhY3Rvcnkoc2VhcmNoUG9pbnRlci5nZXQodGFibGVTdGF0ZSkpO1xuICAgICAgICBjb25zdCBzb3J0RnVuYyA9IHNvcnRGYWN0b3J5KHNvcnRQb2ludGVyLmdldCh0YWJsZVN0YXRlKSk7XG4gICAgICAgIGNvbnN0IHNsaWNlRnVuYyA9IHNsaWNlRmFjdG9yeShzbGljZVBvaW50ZXIuZ2V0KHRhYmxlU3RhdGUpKTtcbiAgICAgICAgY29uc3QgZXhlY0Z1bmMgPSBjb21wb3NlKGZpbHRlckZ1bmMsIHNlYXJjaEZ1bmMsIHRhcChkaXNwYXRjaFN1bW1hcnkpLCBzb3J0RnVuYywgc2xpY2VGdW5jKTtcbiAgICAgICAgY29uc3QgZGlzcGxheWVkID0gZXhlY0Z1bmMoZGF0YSk7XG4gICAgICAgIHRhYmxlLmRpc3BhdGNoKERJU1BMQVlfQ0hBTkdFRCwgZGlzcGxheWVkLm1hcChkID0+IHtcbiAgICAgICAgICByZXR1cm4ge2luZGV4OiBkYXRhLmluZGV4T2YoZCksIHZhbHVlOiBkfTtcbiAgICAgICAgfSkpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0YWJsZS5kaXNwYXRjaChFWEVDX0VSUk9SLCBlKTtcbiAgICAgIH0gZmluYWxseSB7XG4gICAgICAgIHRhYmxlLmRpc3BhdGNoKEVYRUNfQ0hBTkdFRCwge3dvcmtpbmc6IGZhbHNlfSk7XG4gICAgICB9XG4gICAgfSwgcHJvY2Vzc2luZ0RlbGF5KTtcbiAgfTtcblxuICBjb25zdCB1cGRhdGVUYWJsZVN0YXRlID0gY3VycnkoKHB0ZXIsIGV2LCBuZXdQYXJ0aWFsU3RhdGUpID0+IGNvbXBvc2UoXG4gICAgc2FmZUFzc2lnbihwdGVyLmdldCh0YWJsZVN0YXRlKSksXG4gICAgdGFwKGRpc3BhdGNoKGV2KSksXG4gICAgcHRlci5zZXQodGFibGVTdGF0ZSlcbiAgKShuZXdQYXJ0aWFsU3RhdGUpKTtcblxuICBjb25zdCByZXNldFRvRmlyc3RQYWdlID0gKCkgPT4gdXBkYXRlVGFibGVTdGF0ZShzbGljZVBvaW50ZXIsIFBBR0VfQ0hBTkdFRCwge3BhZ2U6IDF9KTtcblxuICBjb25zdCB0YWJsZU9wZXJhdGlvbiA9IChwdGVyLCBldikgPT4gY29tcG9zZShcbiAgICB1cGRhdGVUYWJsZVN0YXRlKHB0ZXIsIGV2KSxcbiAgICByZXNldFRvRmlyc3RQYWdlLFxuICAgICgpID0+IHRhYmxlLmV4ZWMoKSAvLyB3ZSB3cmFwIHdpdGhpbiBhIGZ1bmN0aW9uIHNvIHRhYmxlLmV4ZWMgY2FuIGJlIG92ZXJ3cml0dGVuICh3aGVuIHVzaW5nIHdpdGggYSBzZXJ2ZXIgZm9yIGV4YW1wbGUpXG4gICk7XG5cbiAgY29uc3QgYXBpID0ge1xuICAgIHNvcnQ6IHRhYmxlT3BlcmF0aW9uKHNvcnRQb2ludGVyLCBUT0dHTEVfU09SVCksXG4gICAgZmlsdGVyOiB0YWJsZU9wZXJhdGlvbihmaWx0ZXJQb2ludGVyLCBGSUxURVJfQ0hBTkdFRCksXG4gICAgc2VhcmNoOiB0YWJsZU9wZXJhdGlvbihzZWFyY2hQb2ludGVyLCBTRUFSQ0hfQ0hBTkdFRCksXG4gICAgc2xpY2U6IGNvbXBvc2UodXBkYXRlVGFibGVTdGF0ZShzbGljZVBvaW50ZXIsIFBBR0VfQ0hBTkdFRCksICgpID0+IHRhYmxlLmV4ZWMoKSksXG4gICAgZXhlYyxcbiAgICBldmFsKHN0YXRlID0gdGFibGVTdGF0ZSl7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKClcbiAgICAgICAgLnRoZW4oZnVuY3Rpb24gKCkge1xuICAgICAgICAgIGNvbnN0IHNvcnRGdW5jID0gc29ydEZhY3Rvcnkoc29ydFBvaW50ZXIuZ2V0KHN0YXRlKSk7XG4gICAgICAgICAgY29uc3Qgc2VhcmNoRnVuYyA9IHNlYXJjaEZhY3Rvcnkoc2VhcmNoUG9pbnRlci5nZXQoc3RhdGUpKTtcbiAgICAgICAgICBjb25zdCBmaWx0ZXJGdW5jID0gZmlsdGVyRmFjdG9yeShmaWx0ZXJQb2ludGVyLmdldChzdGF0ZSkpO1xuICAgICAgICAgIGNvbnN0IHNsaWNlRnVuYyA9IHNsaWNlRmFjdG9yeShzbGljZVBvaW50ZXIuZ2V0KHN0YXRlKSk7XG4gICAgICAgICAgY29uc3QgZXhlY0Z1bmMgPSBjb21wb3NlKGZpbHRlckZ1bmMsIHNlYXJjaEZ1bmMsIHNvcnRGdW5jLCBzbGljZUZ1bmMpO1xuICAgICAgICAgIHJldHVybiBleGVjRnVuYyhkYXRhKS5tYXAoZCA9PiB7XG4gICAgICAgICAgICByZXR1cm4ge2luZGV4OiBkYXRhLmluZGV4T2YoZCksIHZhbHVlOiBkfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB9LFxuICAgIG9uRGlzcGxheUNoYW5nZShmbil7XG4gICAgICB0YWJsZS5vbihESVNQTEFZX0NIQU5HRUQsIGZuKTtcbiAgICB9LFxuICAgIGdldFRhYmxlU3RhdGUoKXtcbiAgICAgIGNvbnN0IHNvcnQgPSBPYmplY3QuYXNzaWduKHt9LCB0YWJsZVN0YXRlLnNvcnQpO1xuICAgICAgY29uc3Qgc2VhcmNoID0gT2JqZWN0LmFzc2lnbih7fSwgdGFibGVTdGF0ZS5zZWFyY2gpO1xuICAgICAgY29uc3Qgc2xpY2UgPSBPYmplY3QuYXNzaWduKHt9LCB0YWJsZVN0YXRlLnNsaWNlKTtcbiAgICAgIGNvbnN0IGZpbHRlciA9IHt9O1xuICAgICAgZm9yIChsZXQgcHJvcCBpbiB0YWJsZVN0YXRlLmZpbHRlcikge1xuICAgICAgICBmaWx0ZXJbcHJvcF0gPSB0YWJsZVN0YXRlLmZpbHRlcltwcm9wXS5tYXAodiA9PiBPYmplY3QuYXNzaWduKHt9LCB2KSk7XG4gICAgICB9XG4gICAgICByZXR1cm4ge3NvcnQsIHNlYXJjaCwgc2xpY2UsIGZpbHRlcn07XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGluc3RhbmNlID0gT2JqZWN0LmFzc2lnbih0YWJsZSwgYXBpKTtcblxuICBPYmplY3QuZGVmaW5lUHJvcGVydHkoaW5zdGFuY2UsICdsZW5ndGgnLCB7XG4gICAgZ2V0KCl7XG4gICAgICByZXR1cm4gZGF0YS5sZW5ndGg7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gaW5zdGFuY2U7XG59IiwiaW1wb3J0IHNvcnQgZnJvbSAnc21hcnQtdGFibGUtc29ydCc7XG5pbXBvcnQgZmlsdGVyIGZyb20gJ3NtYXJ0LXRhYmxlLWZpbHRlcic7XG5pbXBvcnQgc2VhcmNoIGZyb20gJ3NtYXJ0LXRhYmxlLXNlYXJjaCc7XG5pbXBvcnQgdGFibGUgZnJvbSAnLi9kaXJlY3RpdmVzL3RhYmxlJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHtcbiAgc29ydEZhY3RvcnkgPSBzb3J0LFxuICBmaWx0ZXJGYWN0b3J5ID0gZmlsdGVyLFxuICBzZWFyY2hGYWN0b3J5ID0gc2VhcmNoLFxuICB0YWJsZVN0YXRlID0ge3NvcnQ6IHt9LCBzbGljZToge3BhZ2U6IDF9LCBmaWx0ZXI6IHt9LCBzZWFyY2g6IHt9fSxcbiAgZGF0YSA9IFtdXG59LCAuLi50YWJsZURpcmVjdGl2ZXMpIHtcblxuICBjb25zdCBjb3JlVGFibGUgPSB0YWJsZSh7c29ydEZhY3RvcnksIGZpbHRlckZhY3RvcnksIHRhYmxlU3RhdGUsIGRhdGEsIHNlYXJjaEZhY3Rvcnl9KTtcblxuICByZXR1cm4gdGFibGVEaXJlY3RpdmVzLnJlZHVjZSgoYWNjdW11bGF0b3IsIG5ld2RpcikgPT4ge1xuICAgIHJldHVybiBPYmplY3QuYXNzaWduKGFjY3VtdWxhdG9yLCBuZXdkaXIoe1xuICAgICAgc29ydEZhY3RvcnksXG4gICAgICBmaWx0ZXJGYWN0b3J5LFxuICAgICAgc2VhcmNoRmFjdG9yeSxcbiAgICAgIHRhYmxlU3RhdGUsXG4gICAgICBkYXRhLFxuICAgICAgdGFibGU6IGNvcmVUYWJsZVxuICAgIH0pKTtcbiAgfSwgY29yZVRhYmxlKTtcbn0iLCJpbXBvcnQge0ZJTFRFUl9DSEFOR0VEfSBmcm9tICcuLi9ldmVudHMnO1xuaW1wb3J0IHtwcm94eUxpc3RlbmVyfSBmcm9tICdzbWFydC10YWJsZS1ldmVudHMnO1xuXG5jb25zdCBmaWx0ZXJMaXN0ZW5lciA9IHByb3h5TGlzdGVuZXIoe1tGSUxURVJfQ0hBTkdFRF06ICdvbkZpbHRlckNoYW5nZSd9KTtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHt0YWJsZSwgcG9pbnRlciwgb3BlcmF0b3IgPSAnaW5jbHVkZXMnLCB0eXBlID0gJ3N0cmluZyd9KSB7XG4gIHJldHVybiBPYmplY3QuYXNzaWduKHtcbiAgICAgIGZpbHRlcihpbnB1dCl7XG4gICAgICAgIGNvbnN0IGZpbHRlckNvbmYgPSB7XG4gICAgICAgICAgW3BvaW50ZXJdOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIHZhbHVlOiBpbnB1dCxcbiAgICAgICAgICAgICAgb3BlcmF0b3IsXG4gICAgICAgICAgICAgIHR5cGVcbiAgICAgICAgICAgIH1cbiAgICAgICAgICBdXG5cbiAgICAgICAgfTtcbiAgICAgICAgcmV0dXJuIHRhYmxlLmZpbHRlcihmaWx0ZXJDb25mKTtcbiAgICAgIH1cbiAgICB9LFxuICAgIGZpbHRlckxpc3RlbmVyKHtlbWl0dGVyOiB0YWJsZX0pKTtcbn0iLCJpbXBvcnQge1NFQVJDSF9DSEFOR0VEfSBmcm9tICcuLi9ldmVudHMnO1xuaW1wb3J0IHtwcm94eUxpc3RlbmVyfSBmcm9tICdzbWFydC10YWJsZS1ldmVudHMnO1xuXG5jb25zdCBzZWFyY2hMaXN0ZW5lciA9IHByb3h5TGlzdGVuZXIoe1tTRUFSQ0hfQ0hBTkdFRF06ICdvblNlYXJjaENoYW5nZSd9KTtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHt0YWJsZSwgc2NvcGUgPSBbXX0pIHtcbiAgcmV0dXJuIE9iamVjdC5hc3NpZ24oXG4gICAgc2VhcmNoTGlzdGVuZXIoe2VtaXR0ZXI6IHRhYmxlfSksIHtcbiAgICAgIHNlYXJjaChpbnB1dCl7XG4gICAgICAgIHJldHVybiB0YWJsZS5zZWFyY2goe3ZhbHVlOiBpbnB1dCwgc2NvcGV9KTtcbiAgICAgIH1cbiAgICB9KTtcbn0iLCJpbXBvcnQge1BBR0VfQ0hBTkdFRCwgU1VNTUFSWV9DSEFOR0VEfSBmcm9tICcuLi9ldmVudHMnO1xuaW1wb3J0IHtwcm94eUxpc3RlbmVyfSBmcm9tICdzbWFydC10YWJsZS1ldmVudHMnO1xuXG5jb25zdCBzbGljZUxpc3RlbmVyID0gcHJveHlMaXN0ZW5lcih7W1BBR0VfQ0hBTkdFRF06ICdvblBhZ2VDaGFuZ2UnLCBbU1VNTUFSWV9DSEFOR0VEXTogJ29uU3VtbWFyeUNoYW5nZSd9KTtcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHt0YWJsZX0pIHtcbiAgbGV0IHtzbGljZTp7cGFnZTpjdXJyZW50UGFnZSwgc2l6ZTpjdXJyZW50U2l6ZX19ID0gdGFibGUuZ2V0VGFibGVTdGF0ZSgpO1xuICBsZXQgaXRlbUxpc3RMZW5ndGggPSB0YWJsZS5sZW5ndGg7XG5cbiAgY29uc3QgYXBpID0ge1xuICAgIHNlbGVjdFBhZ2UocCl7XG4gICAgICByZXR1cm4gdGFibGUuc2xpY2Uoe3BhZ2U6IHAsIHNpemU6IGN1cnJlbnRTaXplfSk7XG4gICAgfSxcbiAgICBzZWxlY3ROZXh0UGFnZSgpe1xuICAgICAgcmV0dXJuIGFwaS5zZWxlY3RQYWdlKGN1cnJlbnRQYWdlICsgMSk7XG4gICAgfSxcbiAgICBzZWxlY3RQcmV2aW91c1BhZ2UoKXtcbiAgICAgIHJldHVybiBhcGkuc2VsZWN0UGFnZShjdXJyZW50UGFnZSAtIDEpO1xuICAgIH0sXG4gICAgY2hhbmdlUGFnZVNpemUoc2l6ZSl7XG4gICAgICByZXR1cm4gdGFibGUuc2xpY2Uoe3BhZ2U6IDEsIHNpemV9KTtcbiAgICB9LFxuICAgIGlzUHJldmlvdXNQYWdlRW5hYmxlZCgpe1xuICAgICAgcmV0dXJuIGN1cnJlbnRQYWdlID4gMTtcbiAgICB9LFxuICAgIGlzTmV4dFBhZ2VFbmFibGVkKCl7XG4gICAgICByZXR1cm4gTWF0aC5jZWlsKGl0ZW1MaXN0TGVuZ3RoIC8gY3VycmVudFNpemUpID4gY3VycmVudFBhZ2U7XG4gICAgfVxuICB9O1xuICBjb25zdCBkaXJlY3RpdmUgPSBPYmplY3QuYXNzaWduKGFwaSwgc2xpY2VMaXN0ZW5lcih7ZW1pdHRlcjogdGFibGV9KSk7XG5cbiAgZGlyZWN0aXZlLm9uU3VtbWFyeUNoYW5nZSgoe3BhZ2U6cCwgc2l6ZTpzLCBmaWx0ZXJlZENvdW50fSkgPT4ge1xuICAgIGN1cnJlbnRQYWdlID0gcDtcbiAgICBjdXJyZW50U2l6ZSA9IHM7XG4gICAgaXRlbUxpc3RMZW5ndGggPSBmaWx0ZXJlZENvdW50O1xuICB9KTtcblxuICByZXR1cm4gZGlyZWN0aXZlO1xufVxuIiwiaW1wb3J0IHtUT0dHTEVfU09SVH0gZnJvbSAnLi4vZXZlbnRzJ1xuaW1wb3J0IHtwcm94eUxpc3RlbmVyfSBmcm9tICdzbWFydC10YWJsZS1ldmVudHMnO1xuXG5jb25zdCBzb3J0TGlzdGVuZXJzID0gcHJveHlMaXN0ZW5lcih7W1RPR0dMRV9TT1JUXTogJ29uU29ydFRvZ2dsZSd9KTtcbmNvbnN0IGRpcmVjdGlvbnMgPSBbJ2FzYycsICdkZXNjJ107XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uICh7cG9pbnRlciwgdGFibGUsIGN5Y2xlID0gZmFsc2V9KSB7XG5cbiAgY29uc3QgY3ljbGVEaXJlY3Rpb25zID0gY3ljbGUgPT09IHRydWUgPyBbJ25vbmUnXS5jb25jYXQoZGlyZWN0aW9ucykgOiBbLi4uZGlyZWN0aW9uc10ucmV2ZXJzZSgpO1xuXG4gIGxldCBoaXQgPSAwO1xuXG4gIGNvbnN0IGRpcmVjdGl2ZSA9IE9iamVjdC5hc3NpZ24oe1xuICAgIHRvZ2dsZSgpe1xuICAgICAgaGl0Kys7XG4gICAgICBjb25zdCBkaXJlY3Rpb24gPSBjeWNsZURpcmVjdGlvbnNbaGl0ICUgY3ljbGVEaXJlY3Rpb25zLmxlbmd0aF07XG4gICAgICByZXR1cm4gdGFibGUuc29ydCh7cG9pbnRlciwgZGlyZWN0aW9ufSk7XG4gICAgfVxuXG4gIH0sIHNvcnRMaXN0ZW5lcnMoe2VtaXR0ZXI6IHRhYmxlfSkpO1xuXG4gIGRpcmVjdGl2ZS5vblNvcnRUb2dnbGUoKHtwb2ludGVyOnB9KSA9PiB7XG4gICAgaWYgKHBvaW50ZXIgIT09IHApIHtcbiAgICAgIGhpdCA9IDA7XG4gICAgfVxuICB9KTtcblxuICByZXR1cm4gZGlyZWN0aXZlO1xufSIsImltcG9ydCB7U1VNTUFSWV9DSEFOR0VEfSBmcm9tICcuLi9ldmVudHMnO1xuaW1wb3J0IHtwcm94eUxpc3RlbmVyfSBmcm9tICdzbWFydC10YWJsZS1ldmVudHMnO1xuXG5jb25zdCBleGVjdXRpb25MaXN0ZW5lciA9IHByb3h5TGlzdGVuZXIoe1tTVU1NQVJZX0NIQU5HRURdOiAnb25TdW1tYXJ5Q2hhbmdlJ30pO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoe3RhYmxlfSkge1xuICByZXR1cm4gZXhlY3V0aW9uTGlzdGVuZXIoe2VtaXR0ZXI6IHRhYmxlfSk7XG59XG4iLCJpbXBvcnQge0VYRUNfQ0hBTkdFRH0gZnJvbSAnLi4vZXZlbnRzJztcbmltcG9ydCB7cHJveHlMaXN0ZW5lcn0gZnJvbSAnc21hcnQtdGFibGUtZXZlbnRzJztcblxuY29uc3QgZXhlY3V0aW9uTGlzdGVuZXIgPSBwcm94eUxpc3RlbmVyKHtbRVhFQ19DSEFOR0VEXTogJ29uRXhlY3V0aW9uQ2hhbmdlJ30pO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoe3RhYmxlfSkge1xuICByZXR1cm4gZXhlY3V0aW9uTGlzdGVuZXIoe2VtaXR0ZXI6IHRhYmxlfSk7XG59XG4iLCJpbXBvcnQgdGFibGVEaXJlY3RpdmUgZnJvbSAnLi9zcmMvdGFibGUnO1xuaW1wb3J0IGZpbHRlckRpcmVjdGl2ZSBmcm9tICcuL3NyYy9kaXJlY3RpdmVzL2ZpbHRlcic7XG5pbXBvcnQgc2VhcmNoRGlyZWN0aXZlIGZyb20gJy4vc3JjL2RpcmVjdGl2ZXMvc2VhcmNoJztcbmltcG9ydCBzbGljZURpcmVjdGl2ZSBmcm9tICcuL3NyYy9kaXJlY3RpdmVzL3NsaWNlJztcbmltcG9ydCBzb3J0RGlyZWN0aXZlIGZyb20gJy4vc3JjL2RpcmVjdGl2ZXMvc29ydCc7XG5pbXBvcnQgc3VtbWFyeURpcmVjdGl2ZSBmcm9tICcuL3NyYy9kaXJlY3RpdmVzL3N1bW1hcnknO1xuaW1wb3J0IHdvcmtpbmdJbmRpY2F0b3JEaXJlY3RpdmUgZnJvbSAnLi9zcmMvZGlyZWN0aXZlcy93b3JraW5nSW5kaWNhdG9yJztcblxuZXhwb3J0IGNvbnN0IHNlYXJjaCA9IHNlYXJjaERpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCBzbGljZSA9IHNsaWNlRGlyZWN0aXZlO1xuZXhwb3J0IGNvbnN0IHN1bW1hcnkgPSBzdW1tYXJ5RGlyZWN0aXZlO1xuZXhwb3J0IGNvbnN0IHNvcnQgPSBzb3J0RGlyZWN0aXZlO1xuZXhwb3J0IGNvbnN0IGZpbHRlciA9IGZpbHRlckRpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCB3b3JraW5nSW5kaWNhdG9yID0gd29ya2luZ0luZGljYXRvckRpcmVjdGl2ZTtcbmV4cG9ydCBjb25zdCB0YWJsZSA9IHRhYmxlRGlyZWN0aXZlO1xuZXhwb3J0IGRlZmF1bHQgdGFibGU7XG4iLCJpbXBvcnQge3dvcmtpbmdJbmRpY2F0b3J9IGZyb20gJ3NtYXJ0LXRhYmxlLWNvcmUnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoe3RhYmxlLCBlbH0pIHtcbiAgY29uc3QgY29tcG9uZW50ID0gd29ya2luZ0luZGljYXRvcih7dGFibGV9KTtcbiAgY29tcG9uZW50Lm9uRXhlY3V0aW9uQ2hhbmdlKGZ1bmN0aW9uICh7d29ya2luZ30pIHtcbiAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdzdC13b3JraW5nJyk7XG4gICAgaWYgKHdvcmtpbmcgPT09IHRydWUpIHtcbiAgICAgIGVsLmNsYXNzTGlzdC5hZGQoJ3N0LXdvcmtpbmcnKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gY29tcG9uZW50O1xufTsiLCJpbXBvcnQge3NvcnR9IGZyb20gJ3NtYXJ0LXRhYmxlLWNvcmUnO1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoe2VsLCB0YWJsZSwgY29uZiA9IHt9fSkge1xuICBjb25zdCBwb2ludGVyID0gY29uZi5wb2ludGVyIHx8IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1zdC1zb3J0Jyk7XG4gIGNvbnN0IGN5Y2xlID0gY29uZi5jeWNsZSB8fCBlbC5oYXNBdHRyaWJ1dGUoJ2RhdGEtc3Qtc29ydC1jeWNsZScpO1xuICBjb25zdCBjb21wb25lbnQgPSBzb3J0KHtwb2ludGVyLCB0YWJsZSwgY3ljbGV9KTtcbiAgY29tcG9uZW50Lm9uU29ydFRvZ2dsZSgoe3BvaW50ZXI6Y3VycmVudFBvaW50ZXIsIGRpcmVjdGlvbn0pID0+IHtcbiAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdzdC1zb3J0LWFzYycsICdzdC1zb3J0LWRlc2MnKTtcbiAgICBpZiAocG9pbnRlciA9PT0gY3VycmVudFBvaW50ZXIgJiYgZGlyZWN0aW9uICE9PSAnbm9uZScpIHtcbiAgICAgIGNvbnN0IGNsYXNzTmFtZSA9IGRpcmVjdGlvbiA9PT0gJ2FzYycgPyAnc3Qtc29ydC1hc2MnIDogJ3N0LXNvcnQtZGVzYyc7XG4gICAgICBlbC5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG4gICAgfVxuICB9KTtcbiAgY29uc3QgZXZlbnRMaXN0ZW5lciA9IGV2ID0+IGNvbXBvbmVudC50b2dnbGUoKTtcbiAgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCBldmVudExpc3RlbmVyKTtcbiAgcmV0dXJuIGNvbXBvbmVudDtcbn0iLCJleHBvcnQgZnVuY3Rpb24gZGVib3VuY2UgKGZuLCBkZWxheSkge1xuICBsZXQgdGltZW91dElkO1xuICByZXR1cm4gKGV2KSA9PiB7XG4gICAgaWYgKHRpbWVvdXRJZCkge1xuICAgICAgd2luZG93LmNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgIH1cbiAgICB0aW1lb3V0SWQgPSB3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICBmbihldik7XG4gICAgfSwgZGVsYXkpO1xuICB9O1xufTsiLCJpbXBvcnQge2ZpbHRlcn0gZnJvbSAnc21hcnQtdGFibGUtY29yZSc7XG5pbXBvcnQge2RlYm91bmNlfSBmcm9tICcuL2hlbHBlcnMnXG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGZpbHRlcklucHV0ICh7dGFibGUsIGVsLCBkZWxheSA9IDQwMCwgY29uZiA9IHt9fSkge1xuICBjb25zdCBwb2ludGVyID0gY29uZi5wb2ludGVyIHx8IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1zdC1maWx0ZXInKTtcbiAgY29uc3Qgb3BlcmF0b3IgPSBjb25mLm9wZXJhdG9yIHx8IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1zdC1maWx0ZXItb3BlcmF0b3InKSB8fCAnaW5jbHVkZXMnO1xuICBjb25zdCBlbFR5cGUgPSBlbC5oYXNBdHRyaWJ1dGUoJ3R5cGUnKSA/IGVsLmdldEF0dHJpYnV0ZSgndHlwZScpIDogJ3N0cmluZyc7XG4gIGxldCB0eXBlID0gY29uZi50eXBlIHx8IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1zdC1maWx0ZXItdHlwZScpO1xuICBpZiAoIXR5cGUpIHtcbiAgICB0eXBlID0gWydkYXRlJywgJ251bWJlciddLmluY2x1ZGVzKGVsVHlwZSkgPyBlbFR5cGUgOiAnc3RyaW5nJztcbiAgfVxuICBjb25zdCBjb21wb25lbnQgPSBmaWx0ZXIoe3RhYmxlLCBwb2ludGVyLCB0eXBlLCBvcGVyYXRvcn0pO1xuICBjb25zdCBldmVudExpc3RlbmVyID0gZGVib3VuY2UoZXYgPT4gY29tcG9uZW50LmZpbHRlcihlbC52YWx1ZSksIGRlbGF5KTtcbiAgZWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBldmVudExpc3RlbmVyKTtcbiAgaWYgKGVsLnRhZ05hbWUgPT09ICdTRUxFQ1QnKSB7XG4gICAgZWwuYWRkRXZlbnRMaXN0ZW5lcignY2hhbmdlJywgZXZlbnRMaXN0ZW5lcik7XG4gIH1cbiAgcmV0dXJuIGNvbXBvbmVudDtcbn07IiwiaW1wb3J0IHtzZWFyY2h9IGZyb20gJ3NtYXJ0LXRhYmxlLWNvcmUnO1xuaW1wb3J0IHtkZWJvdW5jZX0gZnJvbSAnLi9oZWxwZXJzJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHtlbCwgdGFibGUsIGRlbGF5ID0gNDAwLCBjb25mID0ge319KSB7XG4gIGNvbnN0IHNjb3BlID0gY29uZi5zY29wZSB8fCAoZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXN0LXNlYXJjaCcpIHx8ICcnKS5zcGxpdCgnLCcpLm1hcChzID0+IHMudHJpbSgpKTtcbiAgY29uc3QgY29tcG9uZW50ID0gc2VhcmNoKHt0YWJsZSwgc2NvcGV9KTtcbiAgY29uc3QgZXZlbnRMaXN0ZW5lciA9IGRlYm91bmNlKGV2ID0+IHtcbiAgICBjb21wb25lbnQuc2VhcmNoKGVsLnZhbHVlKTtcbiAgfSwgZGVsYXkpO1xuICBlbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGV2ZW50TGlzdGVuZXIpO1xufTsiLCJpbXBvcnQgbG9hZGluZyBmcm9tICcuL2xvYWRpbmdJbmRpY2F0b3InO1xuaW1wb3J0IHNvcnQgZnJvbSAgJy4vc29ydCc7XG5pbXBvcnQgZmlsdGVyIGZyb20gJy4vZmlsdGVycydcbmltcG9ydCBzZWFyY2hJbnB1dCBmcm9tICcuL3NlYXJjaCdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHtlbCwgdGFibGV9KSB7XG4gIC8vIGJvb3RcbiAgWy4uLmVsLnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLXN0LXNvcnRdJyldLmZvckVhY2goZWwgPT4gc29ydCh7ZWwsIHRhYmxlfSkpO1xuICBbLi4uZWwucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtc3QtbG9hZGluZy1pbmRpY2F0b3JdJyldLmZvckVhY2goZWwgPT4gbG9hZGluZyh7ZWwsIHRhYmxlfSkpO1xuICBbLi4uZWwucXVlcnlTZWxlY3RvckFsbCgnW2RhdGEtc3Qtc2VhcmNoXScpXS5mb3JFYWNoKGVsID0+IHNlYXJjaElucHV0KHtlbCwgdGFibGV9KSk7XG4gIFsuLi5lbC5xdWVyeVNlbGVjdG9yQWxsKCdbZGF0YS1zdC1maWx0ZXJdJyldLmZvckVhY2goZWwgPT4gZmlsdGVyKHtlbCwgdGFibGV9KSk7XG5cbiAgLy9leHRlbnNpb25cbiAgY29uc3QgdGFibGVEaXNwbGF5Q2hhbmdlID0gdGFibGUub25EaXNwbGF5Q2hhbmdlO1xuICByZXR1cm4gT2JqZWN0LmFzc2lnbih0YWJsZSwge1xuICAgIG9uRGlzcGxheUNoYW5nZTogKGxpc3RlbmVyKSA9PiB7XG4gICAgICB0YWJsZURpc3BsYXlDaGFuZ2UobGlzdGVuZXIpO1xuICAgICAgdGFibGUuZXhlYygpO1xuICAgIH1cbiAgfSk7XG59OyIsImV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uICh7bmFtZTp7Zmlyc3Q6Zmlyc3ROYW1lLCBsYXN0Omxhc3ROYW1lfSwgZ2VuZGVyLCBiaXJ0aERhdGUsIHNpemV9KSB7XG4gIGNvbnN0IHRyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndHInKTtcbiAgdHIuaW5uZXJIVE1MID0gYDx0ZD4ke2xhc3ROYW1lfTwvdGQ+PHRkPiR7Zmlyc3ROYW1lfTwvdGQ+PHRkPiR7Z2VuZGVyfTwvdGQ+PHRkPiR7YmlydGhEYXRlLnRvTG9jYWxlRGF0ZVN0cmluZygpfTwvdGQ+PHRkPiR7c2l6ZX08L3RkPmA7XG4gIHJldHVybiB0cjtcbn0iLCJpbXBvcnQge3N1bW1hcnl9ICBmcm9tICdzbWFydC10YWJsZS1jb3JlJ1xuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBzdW1tYXJ5Q29tcG9uZW50ICh7dGFibGUsIGVsfSkge1xuICBjb25zdCBkaXIgPSBzdW1tYXJ5KHt0YWJsZX0pO1xuICBkaXIub25TdW1tYXJ5Q2hhbmdlKCh7cGFnZSwgc2l6ZSwgZmlsdGVyZWRDb3VudH0pID0+IHtcbiAgICBlbC5pbm5lckhUTUwgPSBgc2hvd2luZyBpdGVtcyA8c3Ryb25nPiR7KHBhZ2UgLSAxKSAqIHNpemUgKyAoZmlsdGVyZWRDb3VudCA+IDAgPyAxIDogMCl9PC9zdHJvbmc+IC0gPHN0cm9uZz4ke01hdGgubWluKGZpbHRlcmVkQ291bnQsIHBhZ2UgKiBzaXplKX08L3N0cm9uZz4gb2YgPHN0cm9uZz4ke2ZpbHRlcmVkQ291bnR9PC9zdHJvbmc+IG1hdGNoaW5nIGl0ZW1zYDtcbiAgfSk7XG4gIHJldHVybiBkaXI7XG59IiwiaW1wb3J0IHtzbGljZX0gZnJvbSAnc21hcnQtdGFibGUtY29yZSc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHBhZ2luYXRpb25Db21wb25lbnQgKHt0YWJsZSwgZWx9KSB7XG4gIGNvbnN0IHByZXZpb3VzQnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gIHByZXZpb3VzQnV0dG9uLmlubmVySFRNTCA9ICdQcmV2aW91cyc7XG4gIGNvbnN0IG5leHRCdXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgbmV4dEJ1dHRvbi5pbm5lckhUTUwgPSAnTmV4dCc7XG4gIGNvbnN0IHBhZ2VTcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICBwYWdlU3Bhbi5pbm5lckhUTUwgPSAnLSBwYWdlIDEgLSc7XG4gIGNvbnN0IGNvbXAgPSBzbGljZSh7dGFibGV9KTtcblxuICBjb21wLm9uU3VtbWFyeUNoYW5nZSgoe3BhZ2V9KSA9PiB7XG4gICAgcHJldmlvdXNCdXR0b24uZGlzYWJsZWQgPSAhY29tcC5pc1ByZXZpb3VzUGFnZUVuYWJsZWQoKTtcbiAgICBuZXh0QnV0dG9uLmRpc2FibGVkID0gIWNvbXAuaXNOZXh0UGFnZUVuYWJsZWQoKTtcbiAgICBwYWdlU3Bhbi5pbm5lckhUTUwgPSBgLSAke3BhZ2V9IC1gO1xuICB9KTtcblxuICBwcmV2aW91c0J1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IGNvbXAuc2VsZWN0UHJldmlvdXNQYWdlKCkpO1xuICBuZXh0QnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gY29tcC5zZWxlY3ROZXh0UGFnZSgpKTtcblxuICBlbC5hcHBlbmRDaGlsZChwcmV2aW91c0J1dHRvbik7XG4gIGVsLmFwcGVuZENoaWxkKHBhZ2VTcGFuKTtcbiAgZWwuYXBwZW5kQ2hpbGQobmV4dEJ1dHRvbik7XG5cbiAgcmV0dXJuIGNvbXA7XG59IiwiaW1wb3J0IHtkZWJvdW5jZX0gZnJvbSAnc21hcnQtdGFibGUtdmFuaWxsYSc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHJhbmdTaXplSW5wdXQgKHttaW5FbCwgbWF4RWwsIHRhYmxlfSkge1xuXG4gIGxldCBsdFZhbHVlO1xuICBsZXQgZ3RWYWx1ZTtcblxuICBjb25zdCBjb21taXQgPSAoKSA9PiB7XG4gICAgY29uc3QgY2xhdXNlcyA9IFtdO1xuICAgIGlmIChsdFZhbHVlKSB7XG4gICAgICBjbGF1c2VzLnB1c2goe3ZhbHVlOiBsdFZhbHVlLCBvcGVyYXRvcjogJ2x0ZScsIHR5cGU6ICdudW1iZXInfSk7XG4gICAgfVxuICAgIGlmIChndFZhbHVlKSB7XG4gICAgICBjbGF1c2VzLnB1c2goe3ZhbHVlOiBndFZhbHVlLCBvcGVyYXRvcjogJ2d0ZScsIHR5cGU6ICdudW1iZXInfSk7XG4gICAgfVxuICAgIHRhYmxlLmZpbHRlcih7XG4gICAgICBzaXplOiBjbGF1c2VzXG4gICAgfSlcbiAgfTtcblxuICBtaW5FbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGRlYm91bmNlKChldikgPT4ge1xuICAgIGd0VmFsdWUgPSBtaW5FbC52YWx1ZTtcbiAgICBjb21taXQoKTtcbiAgfSwgNDAwKSk7XG5cbiAgbWF4RWwuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBkZWJvdW5jZSgoZXYpID0+IHtcbiAgICBsdFZhbHVlID0gbWF4RWwudmFsdWU7XG4gICAgY29tbWl0KCk7XG4gIH0sIDQwMCkpO1xufSIsImV4cG9ydCBkZWZhdWx0ICAoe3F1ZXJ5fSkgPT4gKHt0YWJsZSwgdGFibGVTdGF0ZX0pID0+IHtcbiAgY29uc3QgZXhlYyA9ICgpID0+IHtcbiAgICB0YWJsZS5kaXNwYXRjaCgnRVhFQ19DSEFOR0VEJywge3dvcmtpbmc6IHRydWV9KTtcbiAgICByZXR1cm4gcXVlcnkodGFibGVTdGF0ZSlcbiAgICAgIC50aGVuKCh7ZGF0YSA9IFtdLCBzdW1tYXJ5ID0ge319KSA9PiB7XG4gICAgICAgIHRhYmxlLmRpc3BhdGNoKCdTVU1NQVJZX0NIQU5HRUQnLCBzdW1tYXJ5KTtcbiAgICAgICAgdGFibGUuZGlzcGF0Y2goJ0RJU1BMQVlfQ0hBTkdFRCcsIGRhdGEpO1xuICAgICAgICB0YWJsZS5kaXNwYXRjaCgnRVhFQ19DSEFOR0VEJywge3dvcmtpbmc6IGZhbHNlfSk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGUgPT4ge1xuICAgICAgICB0YWJsZS5kaXNwYXRjaCgnRVhFQ19FUlJPUicsIGUpO1xuICAgICAgICB0YWJsZS5kaXNwYXRjaCgnRVhFQ19DSEFOR0VEJywge3dvcmtpbmc6IGZhbHNlfSk7XG4gICAgICB9KTtcbiAgfTtcblxuICByZXR1cm4gT2JqZWN0LmFzc2lnbih0YWJsZSwge1xuICAgIGV4ZWMsIGV2YWw6ICh0cyA9IHRhYmxlU3RhdGUpID0+IHF1ZXJ5KHRzKS50aGVuKCh7ZGF0YX0pID0+IGRhdGEpXG4gIH0pO1xufTsiLCIvL2EgZmFrZSBzZGsgdG8gbWltaWMgYSBzZXJ2ZXI6IGl0IGFjdHVhbGx5IHVzZXMgYW5vdGhlciBzbWFydC10YWJsZSB0byBwcm9jZXNzIGEgcXVlcnkgYW5kIHJldHVybiB0aGUgcmVzdWx0IHdpdGggYSByYW5kb20gdGltZW91dCB0byBtaW1pYyB0aGUgaHR0cCByZXNwb25zZSB0aW1lXG5pbXBvcnQge3RhYmxlfSBmcm9tICdzbWFydC10YWJsZS1jb3JlJztcblxuZXhwb3J0IGRlZmF1bHQgKCkgPT4ge1xuICBjb25zdCB0ID0gdGFibGUoe2RhdGF9KTtcbiAgcmV0dXJuIHtcbiAgICBxdWVyeTogKHRhYmxlU3RhdGUpID0+IHtcbiAgICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIC8vdGhpcyB0aW1lb3V0IGlzIGp1c3QgdG8gYXZvaWQgdGhlIHVpIHRvIGZyZWV6ZSBhcyBub3JtYWxseSB0aGUgcHJvY2VzcyB3b3VsZCBydW4gb24gdGhlIHNlcnZlclxuICAgICAgICBzZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICBjb25zdCBub3RTbGljZWRTdGF0ZSA9IE9iamVjdC5hc3NpZ24oe30sIHRhYmxlU3RhdGUsIHtcbiAgICAgICAgICAgIHNsaWNlOiB7cGFnZTogMX1cbiAgICAgICAgICB9KTtcbiAgICAgICAgICBQcm9taXNlXG4gICAgICAgICAgICAuYWxsKFt0LmV2YWwodGFibGVTdGF0ZSksIHQuZXZhbChub3RTbGljZWRTdGF0ZSldKVxuICAgICAgICAgICAgLnRoZW4oKFtmdWxsLCBwYXJ0aWFsXSkgPT4ge1xuICAgICAgICAgICAgICAvL3JhbmRvbSB0aW1lb3V0IG9uIHRoZSByZXNwb25zZSB0byBtaW1pYyB0aGUgc2VydmVyIHJlc3BvbnNlIHRpbWVcbiAgICAgICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZSh7XG4gICAgICAgICAgICAgICAgICBkYXRhOiBmdWxsLFxuICAgICAgICAgICAgICAgICAgc3VtbWFyeToge1xuICAgICAgICAgICAgICAgICAgICBwYWdlOiB0YWJsZVN0YXRlLnNsaWNlLnBhZ2UsXG4gICAgICAgICAgICAgICAgICAgIHNpemU6IHRhYmxlU3RhdGUuc2xpY2Uuc2l6ZSxcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyZWRDb3VudDogcGFydGlhbC5sZW5ndGhcbiAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgfSwgTWF0aC5yYW5kb20oKSAqIDIwMDApO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC5jYXRjaChlID0+IHJlamVjdChlKSk7XG4gICAgICAgIH0sIDIwKVxuICAgICAgfSk7XG4gICAgfVxuICB9O1xufTtcblxuXG4iLCJpbXBvcnQge3RhYmxlIGFzIHRhYmxlQ29tcG9uZW50RmFjdG9yeX0gZnJvbSAnc21hcnQtdGFibGUtdmFuaWxsYSc7XG5pbXBvcnQge3RhYmxlfSBmcm9tICdzbWFydC10YWJsZS1jb3JlJztcbmltcG9ydCByb3cgZnJvbSAnLi9jb21wb25lbnRzL3Jvdyc7XG5pbXBvcnQgc3VtbWFyeSBmcm9tICcuL2NvbXBvbmVudHMvc3VtbWFyeSc7XG5pbXBvcnQgcGFnaW5hdGlvbiBmcm9tICcuL2NvbXBvbmVudHMvcGFnaW5hdGlvbic7XG5pbXBvcnQgcmFuZ2VTaXplSW5wdXQgZnJvbSAnLi9jb21wb25lbnRzL3JhbmdlU2l6ZUlucHV0JztcbmltcG9ydCBleHQgZnJvbSAnLi4vaW5kZXgnO1xuaW1wb3J0IHNkayBmcm9tICcuL3Nkayc7XG5cbmNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RhYmxlLWNvbnRhaW5lcicpO1xuY29uc3QgdGJvZHkgPSBlbC5xdWVyeVNlbGVjdG9yKCd0Ym9keScpO1xuY29uc3Qgc3VtbWFyeUVsID0gZWwucXVlcnlTZWxlY3RvcignW2RhdGEtc3Qtc3VtbWFyeV0nKTtcblxuY29uc3QgdCA9IHRhYmxlKFxuICB7dGFibGVTdGF0ZToge3NvcnQ6IHt9LCBmaWx0ZXI6IHt9LCBzbGljZToge3BhZ2U6IDEsIHNpemU6IDIwfX19LFxuICBleHQoc2RrKCkpIC8vc2VydmVyIHNpZGUgZXh0ZW5zaW9uXG4pO1xuY29uc3QgdGFibGVDb21wb25lbnQgPSB0YWJsZUNvbXBvbmVudEZhY3Rvcnkoe2VsLCB0YWJsZTogdH0pO1xuXG5zdW1tYXJ5KHt0YWJsZTogdCwgZWw6IHN1bW1hcnlFbH0pO1xucmFuZ2VTaXplSW5wdXQoe1xuICB0YWJsZTogdCxcbiAgbWluRWw6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtaW4tc2l6ZScpLFxuICBtYXhFbDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21heC1zaXplJylcbn0pO1xuXG5jb25zdCBwYWdpbmF0aW9uQ29udGFpbmVyID0gZWwucXVlcnlTZWxlY3RvcignW2RhdGEtc3QtcGFnaW5hdGlvbl0nKTtcbnBhZ2luYXRpb24oe3RhYmxlOiB0LCBlbDogcGFnaW5hdGlvbkNvbnRhaW5lcn0pO1xuXG50YWJsZUNvbXBvbmVudC5vbkRpc3BsYXlDaGFuZ2UoZGlzcGxheWVkID0+IHtcbiAgdGJvZHkuaW5uZXJIVE1MID0gJyc7XG4gIGZvciAobGV0IHIgb2YgZGlzcGxheWVkKSB7XG4gICAgY29uc3QgbmV3Q2hpbGQgPSByb3coKHIudmFsdWUpLCByLmluZGV4LCB0KTtcbiAgICB0Ym9keS5hcHBlbmRDaGlsZChuZXdDaGlsZCk7XG4gIH1cbn0pO1xuIl0sIm5hbWVzIjpbInBvaW50ZXIiLCJmaWx0ZXIiLCJzb3J0RmFjdG9yeSIsInNvcnQiLCJzZWFyY2giLCJ0YWJsZSIsImV4ZWN1dGlvbkxpc3RlbmVyIiwic3VtbWFyeURpcmVjdGl2ZSIsInRhYmxlRGlyZWN0aXZlIiwic3VtbWFyeSIsInJhbmdlU2l6ZUlucHV0IiwicGFnaW5hdGlvbiJdLCJtYXBwaW5ncyI6Ijs7O0FBQU8sU0FBUyxJQUFJLEVBQUUsQ0FBQyxFQUFFO0VBQ3ZCLE9BQU8sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7Q0FDMUI7O0FBRUQsQUFBTyxTQUFTLE9BQU8sRUFBRSxLQUFLLEVBQUUsR0FBRyxHQUFHLEVBQUU7RUFDdEMsT0FBTyxDQUFDLEdBQUcsSUFBSSxLQUFLLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLEVBQUUsT0FBTyxLQUFLLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDO0NBQzFGOztBQUVELEFBQU8sU0FBUyxLQUFLLEVBQUUsRUFBRSxFQUFFLFNBQVMsRUFBRTtFQUNwQyxNQUFNLEtBQUssR0FBRyxTQUFTLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQztFQUNyQyxPQUFPLENBQUMsR0FBRyxJQUFJLEtBQUs7SUFDbEIsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUM7SUFDbkMsSUFBSSxLQUFLLEtBQUssU0FBUyxFQUFFO01BQ3ZCLE9BQU8sRUFBRSxDQUFDLEdBQUcsSUFBSSxDQUFDLENBQUM7S0FDcEIsTUFBTTtNQUNMLE1BQU0sSUFBSSxHQUFHLENBQUMsR0FBRyxRQUFR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
