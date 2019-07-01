(function () {
    'use strict';

    const swap = (f) => (a, b) => f(b, a);
    const compose = (first, ...fns) => (...args) => fns.reduce((previous, current) => current(previous), first(...args));
    const curry = (fn, arityLeft) => {
        const arity = arityLeft || fn.length;
        return (...args) => {
            const argLength = args.length || 1;
            if (arity === argLength) {
                return fn(...args);
            }
            const func = (...moreArgs) => fn(...args, ...moreArgs);
            return curry(func, arity - args.length);
        };
    };
    const tap = (fn) => arg => {
        fn(arg);
        return arg;
    };

    const pointer = (path) => {
        const parts = path.split('.');
        const partial = (obj = {}, parts = []) => {
            const p = parts.shift();
            const current = obj[p];
            return (current === undefined || current === null || parts.length === 0) ?
                current : partial(current, parts);
        };
        const set = (target, newTree) => {
            let current = target;
            const [leaf, ...intermediate] = parts.reverse();
            for (const key of intermediate.reverse()) {
                if (current[key] === undefined) {
                    current[key] = {};
                    current = current[key];
                }
            }
            current[leaf] = Object.assign(current[leaf] || {}, newTree);
            return target;
        };
        return {
            get(target) {
                return partial(target, [...parts]);
            },
            set
        };
    };

    const defaultComparator = (a, b) => {
        if (a === b) {
            return 0;
        }
        if (a === undefined) {
            return 1;
        }
        if (b === undefined) {
            return -1;
        }
        return a < b ? -1 : 1;
    };
    var SortDirection;
    (function (SortDirection) {
        SortDirection["ASC"] = "asc";
        SortDirection["DESC"] = "desc";
        SortDirection["NONE"] = "none";
    })(SortDirection || (SortDirection = {}));
    const sortByProperty = (prop, comparator) => {
        const propGetter = pointer(prop).get;
        return (a, b) => comparator(propGetter(a), propGetter(b));
    };
    const defaultSortFactory = (conf) => {
        const { pointer: pointer$$1, direction = "asc" /* ASC */, comparator = defaultComparator } = conf;
        if (!pointer$$1 || direction === "none" /* NONE */) {
            return (array) => [...array];
        }
        const orderFunc = sortByProperty(pointer$$1, comparator);
        const compareFunc = direction === "desc" /* DESC */ ? swap(orderFunc) : orderFunc;
        return (array) => [...array].sort(compareFunc);
    };

    var Type;
    (function (Type) {
        Type["BOOLEAN"] = "boolean";
        Type["NUMBER"] = "number";
        Type["DATE"] = "date";
        Type["STRING"] = "string";
    })(Type || (Type = {}));
    const typeExpression = (type) => {
        switch (type) {
            case Type.BOOLEAN:
                return Boolean;
            case Type.NUMBER:
                return Number;
            case Type.DATE:
                return val => new Date(val);
            case Type.STRING:
                return compose(String, val => val.toLowerCase());
            default:
                return val => val;
        }
    };
    var FilterOperator;
    (function (FilterOperator) {
        FilterOperator["INCLUDES"] = "includes";
        FilterOperator["IS"] = "is";
        FilterOperator["IS_NOT"] = "isNot";
        FilterOperator["LOWER_THAN"] = "lt";
        FilterOperator["GREATER_THAN"] = "gt";
        FilterOperator["GREATER_THAN_OR_EQUAL"] = "gte";
        FilterOperator["LOWER_THAN_OR_EQUAL"] = "lte";
        FilterOperator["EQUALS"] = "equals";
        FilterOperator["NOT_EQUALS"] = "notEquals";
        FilterOperator["ANY_OF"] = "anyOf";
    })(FilterOperator || (FilterOperator = {}));
    const not = fn => input => !fn(input);
    const is = value => input => Object.is(value, input);
    const lt = value => input => input < value;
    const gt = value => input => input > value;
    const equals = value => input => value === input;
    const includes = value => input => input.includes(value);
    const anyOf = value => input => value.includes(input);
    const operators = {
        ["includes" /* INCLUDES */]: includes,
        ["is" /* IS */]: is,
        ["isNot" /* IS_NOT */]: compose(is, not),
        ["lt" /* LOWER_THAN */]: lt,
        ["gte" /* GREATER_THAN_OR_EQUAL */]: compose(lt, not),
        ["gt" /* GREATER_THAN */]: gt,
        ["lte" /* LOWER_THAN_OR_EQUAL */]: compose(gt, not),
        ["equals" /* EQUALS */]: equals,
        ["notEquals" /* NOT_EQUALS */]: compose(equals, not),
        ["anyOf" /* ANY_OF */]: anyOf
    };
    const every = fns => (...args) => fns.every(fn => fn(...args));
    const predicate = ({ value = '', operator = "includes" /* INCLUDES */, type }) => {
        const typeIt = typeExpression(type);
        const operateOnTyped = compose(typeIt, operators[operator]);
        const predicateFunc = operateOnTyped(value);
        return compose(typeIt, predicateFunc);
    };
    // Avoid useless filter lookup (improve perf)
    const normalizeClauses = (conf) => {
        const output = {};
        const validPath = Object.keys(conf).filter(path => Array.isArray(conf[path]));
        validPath.forEach(path => {
            const validClauses = conf[path].filter(c => c.value !== '');
            if (validClauses.length > 0) {
                output[path] = validClauses;
            }
        });
        return output;
    };
    const filter = (filter) => {
        const normalizedClauses = normalizeClauses(filter);
        const funcList = Object.keys(normalizedClauses).map(path => {
            const getter = pointer(path).get;
            const clauses = normalizedClauses[path].map(predicate);
            return compose(getter, every(clauses));
        });
        const filterPredicate = every(funcList);
        return array => array.filter(filterPredicate);
    };

    function re(strs, ...substs) {
        let reStr = transformRaw(strs.raw[0]);
        for (const [i, subst] of substs.entries()) {
            if (subst instanceof RegExp) {
                reStr += subst.source;
            } else if (typeof subst === 'string') {
                reStr += quoteText(subst);
            } else {
                throw new Error('Illegal substitution: '+subst);
            }
            reStr += transformRaw(strs.raw[i+1]);
        }
        let flags = '';
        if (reStr.startsWith('/')) {
            const lastSlashIndex = reStr.lastIndexOf('/');
            if (lastSlashIndex === 0) {
                throw new Error('If the `re` string starts with a slash, it must end with a second slash and zero or more flags: '+reStr);
            }
            flags = reStr.slice(lastSlashIndex+1);
            reStr = reStr.slice(1, lastSlashIndex);
        }
        return new RegExp(reStr, flags);
    }

    function transformRaw(str) {
        return str.replace(/\\`/g, '`');
    }

    /**
     * All special characters are escaped, because you may want to quote several characters inside parentheses or square brackets.
     */
    function quoteText(text) {
        return text.replace(/[\\^$.*+?()[\]{}|=!<>:-]/g, '\\$&');
    }

    const regexp = (input) => {
        const { value, scope = [], escape = false, flags = '' } = input;
        const searchPointers = scope.map(field => pointer(field).get);
        if (scope.length === 0 || !value) {
            return (array) => array;
        }
        const regex = escape === true ? re `/${value}/${flags}` : new RegExp(value, flags);
        return (array) => array.filter(item => searchPointers.some(p => regex.test(String(p(item)))));
    };

    const emitter = () => {
        const listenersLists = {};
        const instance = {
            on(event, ...listeners) {
                listenersLists[event] = (listenersLists[event] || []).concat(listeners);
                return instance;
            },
            dispatch(event, ...args) {
                const listeners = listenersLists[event] || [];
                for (const listener of listeners) {
                    listener(...args);
                }
                return instance;
            },
            off(event, ...listeners) {
                if (event === undefined) {
                    Object.keys(listenersLists).forEach(ev => instance.off(ev));
                }
                else {
                    const list = listenersLists[event] || [];
                    listenersLists[event] = listeners.length ? list.filter(listener => !listeners.includes(listener)) : [];
                }
                return instance;
            }
        };
        return instance;
    };
    const proxyListener = (eventMap) => ({ emitter }) => {
        const eventListeners = {};
        const proxy = {
            off(ev) {
                if (!ev) {
                    Object.keys(eventListeners).forEach(eventName => proxy.off(eventName));
                }
                if (eventListeners[ev]) {
                    emitter.off(ev, ...eventListeners[ev]);
                }
                return proxy;
            }
        };
        for (const ev of Object.keys(eventMap)) {
            const method = eventMap[ev];
            eventListeners[ev] = [];
            proxy[method] = function (...listeners) {
                eventListeners[ev] = eventListeners[ev].concat(listeners);
                emitter.on(ev, ...listeners);
                return proxy;
            };
        }
        return proxy;
    };

    const sliceFactory = ({ page = 1, size } = { page: 1 }) => (array = []) => {
        const actualSize = size || array.length;
        const offset = (page - 1) * actualSize;
        return array.slice(offset, offset + actualSize);
    };

    var SmartTableEvents;
    (function (SmartTableEvents) {
        SmartTableEvents["TOGGLE_SORT"] = "TOGGLE_SORT";
        SmartTableEvents["DISPLAY_CHANGED"] = "DISPLAY_CHANGED";
        SmartTableEvents["PAGE_CHANGED"] = "CHANGE_PAGE";
        SmartTableEvents["EXEC_CHANGED"] = "EXEC_CHANGED";
        SmartTableEvents["FILTER_CHANGED"] = "FILTER_CHANGED";
        SmartTableEvents["SUMMARY_CHANGED"] = "SUMMARY_CHANGED";
        SmartTableEvents["SEARCH_CHANGED"] = "SEARCH_CHANGED";
        SmartTableEvents["EXEC_ERROR"] = "EXEC_ERROR";
    })(SmartTableEvents || (SmartTableEvents = {}));
    const curriedPointer = (path) => {
        const { get, set } = pointer(path);
        return { get, set: curry(set) };
    };
    const tableDirective = ({ sortFactory, tableState, data, filterFactory, searchFactory }) => {
        let filteredCount = data.length;
        let matchingItems = data;
        const table = emitter();
        const sortPointer = curriedPointer('sort');
        const slicePointer = curriedPointer('slice');
        const filterPointer = curriedPointer('filter');
        const searchPointer = curriedPointer('search');
        // We need to register in case the summary comes from outside (like server data)
        table.on("SUMMARY_CHANGED" /* SUMMARY_CHANGED */, ({ filteredCount: count }) => {
            filteredCount = count;
        });
        const safeAssign = curry((base, extension) => Object.assign({}, base, extension));
        const dispatch = curry(table.dispatch, 2);
        const dispatchSummary = (filtered) => {
            matchingItems = filtered;
            return dispatch("SUMMARY_CHANGED" /* SUMMARY_CHANGED */, {
                page: tableState.slice.page,
                size: tableState.slice.size,
                filteredCount: filtered.length
            });
        };
        const exec = ({ processingDelay = 20 } = { processingDelay: 20 }) => {
            table.dispatch("EXEC_CHANGED" /* EXEC_CHANGED */, { working: true });
            setTimeout(() => {
                try {
                    const filterFunc = filterFactory(filterPointer.get(tableState));
                    const searchFunc = searchFactory(searchPointer.get(tableState));
                    const sortFunc = sortFactory(sortPointer.get(tableState));
                    const sliceFunc = sliceFactory(slicePointer.get(tableState));
                    const execFunc = compose(filterFunc, searchFunc, tap(dispatchSummary), sortFunc, sliceFunc);
                    const displayed = execFunc(data);
                    table.dispatch("DISPLAY_CHANGED" /* DISPLAY_CHANGED */, displayed.map(d => ({
                        index: data.indexOf(d),
                        value: d
                    })));
                }
                catch (err) {
                    table.dispatch("EXEC_ERROR" /* EXEC_ERROR */, err);
                }
                finally {
                    table.dispatch("EXEC_CHANGED" /* EXEC_CHANGED */, { working: false });
                }
            }, processingDelay);
        };
        const updateTableState = curry((pter, ev, newPartialState) => compose(safeAssign(pter.get(tableState)), tap(dispatch(ev)), pter.set(tableState))(newPartialState));
        const resetToFirstPage = () => updateTableState(slicePointer, "CHANGE_PAGE" /* PAGE_CHANGED */, { page: 1 });
        const tableOperation = (pter, ev) => compose(updateTableState(pter, ev), resetToFirstPage, () => table.exec() // We wrap within a function so table.exec can be overwritten (when using with a server for example)
        );
        const api = {
            sort: tableOperation(sortPointer, "TOGGLE_SORT" /* TOGGLE_SORT */),
            filter: tableOperation(filterPointer, "FILTER_CHANGED" /* FILTER_CHANGED */),
            search: tableOperation(searchPointer, "SEARCH_CHANGED" /* SEARCH_CHANGED */),
            slice: compose(updateTableState(slicePointer, "CHANGE_PAGE" /* PAGE_CHANGED */), () => table.exec()),
            exec,
            async eval(state = tableState) {
                const sortFunc = sortFactory(sortPointer.get(state));
                const searchFunc = searchFactory(searchPointer.get(state));
                const filterFunc = filterFactory(filterPointer.get(state));
                const sliceFunc = sliceFactory(slicePointer.get(state));
                const execFunc = compose(filterFunc, searchFunc, sortFunc, sliceFunc);
                return execFunc(data).map(d => ({ index: data.indexOf(d), value: d }));
            },
            onDisplayChange(fn) {
                table.on("DISPLAY_CHANGED" /* DISPLAY_CHANGED */, fn);
            },
            getTableState() {
                const sort = Object.assign({}, tableState.sort);
                const search = Object.assign({}, tableState.search);
                const slice = Object.assign({}, tableState.slice);
                const filter = {};
                for (const prop of Object.getOwnPropertyNames(tableState.filter)) {
                    filter[prop] = tableState.filter[prop].map(v => Object.assign({}, v));
                }
                return { sort, search, slice, filter };
            },
            getMatchingItems() {
                return [...matchingItems];
            }
        };
        const instance = Object.assign(table, api);
        Object.defineProperties(instance, {
            filteredCount: {
                get() {
                    return filteredCount;
                }
            },
            length: {
                get() {
                    return data.length;
                }
            }
        });
        return instance;
    };

    const filterListener = proxyListener({ ["FILTER_CHANGED" /* FILTER_CHANGED */]: 'onFilterChange' });
    // todo expose and re-export from smart-table-filter
    var FilterType;
    (function (FilterType) {
        FilterType["BOOLEAN"] = "boolean";
        FilterType["NUMBER"] = "number";
        FilterType["DATE"] = "date";
        FilterType["STRING"] = "string";
    })(FilterType || (FilterType = {}));
    const filterDirective = ({ table, pointer, operator = "includes" /* INCLUDES */, type = "string" /* STRING */ }) => {
        const proxy = filterListener({ emitter: table });
        return Object.assign({
            filter(input) {
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
            },
            state() {
                return table.getTableState().filter;
            }
        }, proxy);
    };

    const searchListener = proxyListener({ ["SEARCH_CHANGED" /* SEARCH_CHANGED */]: 'onSearchChange' });
    const searchDirective = ({ table, scope = [] }) => {
        const proxy = searchListener({ emitter: table });
        return Object.assign(proxy, {
            search(input, opts = {}) {
                return table.search(Object.assign({}, { value: input, scope }, opts));
            },
            state() {
                return table.getTableState().search;
            }
        }, proxy);
    };

    const sliceListener = proxyListener({
        ["CHANGE_PAGE" /* PAGE_CHANGED */]: 'onPageChange',
        ["SUMMARY_CHANGED" /* SUMMARY_CHANGED */]: 'onSummaryChange'
    });
    const paginationDirective = ({ table }) => {
        let { slice: { page: currentPage, size: currentSize } } = table.getTableState();
        let itemListLength = table.filteredCount;
        const proxy = sliceListener({ emitter: table });
        const api = {
            selectPage(p) {
                return table.slice({ page: p, size: currentSize });
            },
            selectNextPage() {
                return api.selectPage(currentPage + 1);
            },
            selectPreviousPage() {
                return api.selectPage(currentPage - 1);
            },
            changePageSize(size) {
                return table.slice({ page: 1, size });
            },
            isPreviousPageEnabled() {
                return currentPage > 1;
            },
            isNextPageEnabled() {
                return Math.ceil(itemListLength / currentSize) > currentPage;
            },
            state() {
                return Object.assign(table.getTableState().slice, { filteredCount: itemListLength });
            }
        };
        const directive = Object.assign(api, proxy);
        directive.onSummaryChange(({ page: p, size: s, filteredCount }) => {
            currentPage = p;
            currentSize = s;
            itemListLength = filteredCount;
        });
        return directive;
    };

    const debounce = (fn, time) => {
        let timer = null;
        return (...args) => {
            if (timer !== null) {
                clearTimeout(timer);
            }
            timer = setTimeout(() => fn(...args), time);
        };
    };
    const sortListeners = proxyListener({ ["TOGGLE_SORT" /* TOGGLE_SORT */]: 'onSortToggle' });
    const directions = ["asc" /* ASC */, "desc" /* DESC */];
    const sortDirective = ({ pointer, table, cycle = false, debounceTime = 0 }) => {
        const cycleDirections = cycle === true ? ["none" /* NONE */].concat(directions) : [...directions].reverse();
        const commit = debounce(table.sort, debounceTime);
        let hit = 0;
        const proxy = sortListeners({ emitter: table });
        const directive = Object.assign({
            toggle() {
                hit++;
                const direction = cycleDirections[hit % cycleDirections.length];
                return commit({ pointer, direction });
            },
            state() {
                return table.getTableState().sort;
            }
        }, proxy);
        directive.onSortToggle(({ pointer: p }) => {
            hit = pointer !== p ? 0 : hit;
        });
        const { pointer: statePointer, direction = "asc" /* ASC */ } = directive.state();
        hit = statePointer === pointer ? (direction === "asc" /* ASC */ ? 1 : 2) : 0;
        return directive;
    };

    const summaryListener = proxyListener({ ["SUMMARY_CHANGED" /* SUMMARY_CHANGED */]: 'onSummaryChange' });
    const summaryDirective = ({ table }) => summaryListener({ emitter: table });

    const executionListener = proxyListener({ ["EXEC_CHANGED" /* EXEC_CHANGED */]: 'onExecutionChange' });
    const workingIndicatorDirective = ({ table }) => executionListener({ emitter: table });

    const defaultTableState = () => ({ sort: {}, slice: { page: 1 }, filter: {}, search: {} });
    const smartTable = ({ sortFactory = defaultSortFactory, filterFactory = filter, searchFactory = regexp, tableState = defaultTableState(), data = [] } = {
        sortFactory: defaultSortFactory,
        filterFactory: filter,
        searchFactory: regexp,
        tableState: defaultTableState(),
        data: []
    }, ...tableExtensions) => {
        const coreTable = tableDirective({ sortFactory, filterFactory, tableState, data, searchFactory });
        return tableExtensions.reduce((accumulator, newdir) => Object.assign(accumulator, newdir({
            sortFactory,
            filterFactory,
            searchFactory,
            tableState,
            data,
            table: coreTable
        })), coreTable);
    };

    const loadingIndicator = ({table, el}) => {
        const component = workingIndicatorDirective({table});
        component.onExecutionChange(function ({working}) {
            el.classList.remove('st-working');
            if (working === true) {
                el.classList.add('st-working');
            }
        });
        return component;
    };

    const sort = ({el, table, conf = {}}) => {
        const pointer = conf.pointer || el.getAttribute('data-st-sort');
        const cycle = conf.cycle || el.hasAttribute('data-st-sort-cycle');
        const component = sortDirective({pointer, table, cycle});
        component.onSortToggle(({pointer: currentPointer, direction}) => {
            el.classList.remove('st-sort-asc', 'st-sort-desc');
            if (pointer === currentPointer && direction !== 'none') {
                const className = direction === 'asc' ? 'st-sort-asc' : 'st-sort-desc';
                el.classList.add(className);
            }
        });
        const eventListener = () => component.toggle();
        el.addEventListener('click', eventListener);
        return component;
    };

    function debounce$1(fn, delay) {
        let timeoutId;
        return (ev) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(function () {
                fn(ev);
            }, delay);
        };
    }

    const filter$1 = ({table, el, delay = 400, conf = {}}) => {
        const pointer = conf.pointer || el.getAttribute('data-st-filter');
        const operator = conf.operator || el.getAttribute('data-st-filter-operator') || 'includes';
        const elType = el.hasAttribute('type') ? el.getAttribute('type') : 'string';
        let type = conf.type || el.getAttribute('data-st-filter-type');
        if (!type) {
            type = ['date', 'number'].includes(elType) ? elType : 'string';
        }
        const component = filterDirective({table, pointer, type, operator});
        const eventListener = debounce$1(ev => component.filter(el.value), delay);
        el.addEventListener('input', eventListener);
        if (el.tagName === 'SELECT') {
            el.addEventListener('change', eventListener);
        }
        return component;
    };

    const search = ({el, table, delay = 400, conf = {}}) => {
        const scope = conf.scope || (el.getAttribute('data-st-search') || '')
            .split(',')
            .map(s => s.trim());
        const flags = conf.flags || el.getAttribute('data-st-search-flags') || '';
        const component = searchDirective({table, scope});
        const eventListener = debounce$1(() => {
            component.search(el.value, {flags});
        }, delay);
        el.addEventListener('input', eventListener);
    };

    const table = ({el, table}) => {
        const bootDirective = (factory, selector) => Array.from(el.querySelectorAll(selector)).forEach(el => factory({
            el,
            table
        }));
        // boot
        bootDirective(sort, '[data-st-sort]');
        bootDirective(loadingIndicator, '[data-st-loading-indicator]');
        bootDirective(search, '[data-st-search]');
        bootDirective(filter$1, '[data-st-filter]');

        return table;
    };

    function row ({name:{first:firstName, last:lastName}, gender, birthDate, size}) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${lastName}</td><td>${firstName}</td><td>${gender}</td><td>${birthDate.toLocaleDateString()}</td><td>${size}</td>`;
      return tr;
    }

    function summaryComponent ({table, el}) {
      const dir = summaryDirective({table});
      dir.onSummaryChange(({page, size, filteredCount}) => {
        el.innerHTML = `showing items <strong>${(page - 1) * size + (filteredCount > 0 ? 1 : 0)}</strong> - <strong>${Math.min(filteredCount, page * size)}</strong> of <strong>${filteredCount}</strong> matching items`;
      });
      return dir;
    }

    function paginationComponent ({table, el}) {
      const previousButton = document.createElement('button');
      previousButton.innerHTML = 'Previous';
      const nextButton = document.createElement('button');
      nextButton.innerHTML = 'Next';
      const pageSpan = document.createElement('span');
      pageSpan.innerHTML = '- page 1 -';
      const comp = paginationDirective({table});

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

    function rangSizeInput ({minEl, maxEl, table}) {

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
        table.filter({
          size: clauses
        });
      };

      minEl.addEventListener('input', debounce$1((ev) => {
        gtValue = minEl.value;
        commit();
      }, 400));

      maxEl.addEventListener('input', debounce$1((ev) => {
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
      const t = smartTable({data});
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

    const t = smartTable(
      {tableState: {sort: {}, filter: {}, slice: {page: 1, size: 20}}},
      ext(sdk()) //server side extension
    );
    const tableComponent = table({el, table: t});

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
        const newChild = row((r.value), r.index);
        tbody.appendChild(newChild);
      }
    });

}());
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVuZGxlLmpzIiwic291cmNlcyI6WyIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtb3BlcmF0b3JzL2Rpc3QvYnVuZGxlL21vZHVsZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1qc29uLXBvaW50ZXIvZGlzdC9idW5kbGUvbW9kdWxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLXNvcnQvZGlzdC9idW5kbGUvbW9kdWxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWZpbHRlci9kaXN0L2J1bmRsZS9tb2R1bGUuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtc2VhcmNoL2Rpc3QvYnVuZGxlL21vZHVsZS5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS1ldmVudHMvZGlzdC9idW5kbGUvbW9kdWxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLWNvcmUvZGlzdC9idW5kbGUvbW9kdWxlLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLXZhbmlsbGEvbGliL2xvYWRpbmdJbmRpY2F0b3IuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtdmFuaWxsYS9saWIvc29ydC5qcyIsIi4uL25vZGVfbW9kdWxlcy9zbWFydC10YWJsZS12YW5pbGxhL2xpYi9oZWxwZXJzLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLXZhbmlsbGEvbGliL2ZpbHRlcnMuanMiLCIuLi9ub2RlX21vZHVsZXMvc21hcnQtdGFibGUtdmFuaWxsYS9saWIvc2VhcmNoLmpzIiwiLi4vbm9kZV9tb2R1bGVzL3NtYXJ0LXRhYmxlLXZhbmlsbGEvbGliL3RhYmxlLmpzIiwiY29tcG9uZW50cy9yb3cuanMiLCJjb21wb25lbnRzL3N1bW1hcnkuanMiLCJjb21wb25lbnRzL3BhZ2luYXRpb24uanMiLCJjb21wb25lbnRzL3JhbmdlU2l6ZUlucHV0LmpzIiwiLi4vaW5kZXguanMiLCJzZGsuanMiLCJpbmRleC5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJjb25zdCBzd2FwID0gKGYpID0+IChhLCBiKSA9PiBmKGIsIGEpO1xuY29uc3QgY29tcG9zZSA9IChmaXJzdCwgLi4uZm5zKSA9PiAoLi4uYXJncykgPT4gZm5zLnJlZHVjZSgocHJldmlvdXMsIGN1cnJlbnQpID0+IGN1cnJlbnQocHJldmlvdXMpLCBmaXJzdCguLi5hcmdzKSk7XG5jb25zdCBjdXJyeSA9IChmbiwgYXJpdHlMZWZ0KSA9PiB7XG4gICAgY29uc3QgYXJpdHkgPSBhcml0eUxlZnQgfHwgZm4ubGVuZ3RoO1xuICAgIHJldHVybiAoLi4uYXJncykgPT4ge1xuICAgICAgICBjb25zdCBhcmdMZW5ndGggPSBhcmdzLmxlbmd0aCB8fCAxO1xuICAgICAgICBpZiAoYXJpdHkgPT09IGFyZ0xlbmd0aCkge1xuICAgICAgICAgICAgcmV0dXJuIGZuKC4uLmFyZ3MpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZ1bmMgPSAoLi4ubW9yZUFyZ3MpID0+IGZuKC4uLmFyZ3MsIC4uLm1vcmVBcmdzKTtcbiAgICAgICAgcmV0dXJuIGN1cnJ5KGZ1bmMsIGFyaXR5IC0gYXJncy5sZW5ndGgpO1xuICAgIH07XG59O1xuY29uc3QgYXBwbHkgPSAoZm4pID0+ICguLi5hcmdzKSA9PiBmbiguLi5hcmdzKTtcbmNvbnN0IHRhcCA9IChmbikgPT4gYXJnID0+IHtcbiAgICBmbihhcmcpO1xuICAgIHJldHVybiBhcmc7XG59O1xuXG5leHBvcnQgeyBzd2FwLCBjb21wb3NlLCBjdXJyeSwgYXBwbHksIHRhcCB9O1xuIiwiY29uc3QgcG9pbnRlciA9IChwYXRoKSA9PiB7XG4gICAgY29uc3QgcGFydHMgPSBwYXRoLnNwbGl0KCcuJyk7XG4gICAgY29uc3QgcGFydGlhbCA9IChvYmogPSB7fSwgcGFydHMgPSBbXSkgPT4ge1xuICAgICAgICBjb25zdCBwID0gcGFydHMuc2hpZnQoKTtcbiAgICAgICAgY29uc3QgY3VycmVudCA9IG9ialtwXTtcbiAgICAgICAgcmV0dXJuIChjdXJyZW50ID09PSB1bmRlZmluZWQgfHwgY3VycmVudCA9PT0gbnVsbCB8fCBwYXJ0cy5sZW5ndGggPT09IDApID9cbiAgICAgICAgICAgIGN1cnJlbnQgOiBwYXJ0aWFsKGN1cnJlbnQsIHBhcnRzKTtcbiAgICB9O1xuICAgIGNvbnN0IHNldCA9ICh0YXJnZXQsIG5ld1RyZWUpID0+IHtcbiAgICAgICAgbGV0IGN1cnJlbnQgPSB0YXJnZXQ7XG4gICAgICAgIGNvbnN0IFtsZWFmLCAuLi5pbnRlcm1lZGlhdGVdID0gcGFydHMucmV2ZXJzZSgpO1xuICAgICAgICBmb3IgKGNvbnN0IGtleSBvZiBpbnRlcm1lZGlhdGUucmV2ZXJzZSgpKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFtrZXldID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICBjdXJyZW50W2tleV0gPSB7fTtcbiAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGN1cnJlbnRbbGVhZl0gPSBPYmplY3QuYXNzaWduKGN1cnJlbnRbbGVhZl0gfHwge30sIG5ld1RyZWUpO1xuICAgICAgICByZXR1cm4gdGFyZ2V0O1xuICAgIH07XG4gICAgcmV0dXJuIHtcbiAgICAgICAgZ2V0KHRhcmdldCkge1xuICAgICAgICAgICAgcmV0dXJuIHBhcnRpYWwodGFyZ2V0LCBbLi4ucGFydHNdKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2V0XG4gICAgfTtcbn07XG5cbmV4cG9ydCB7IHBvaW50ZXIgfTtcbiIsImltcG9ydCB7IHN3YXAgfSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuaW1wb3J0IHsgcG9pbnRlciB9IGZyb20gJ3NtYXJ0LXRhYmxlLWpzb24tcG9pbnRlcic7XG5cbmNvbnN0IGRlZmF1bHRDb21wYXJhdG9yID0gKGEsIGIpID0+IHtcbiAgICBpZiAoYSA9PT0gYikge1xuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG4gICAgaWYgKGEgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gMTtcbiAgICB9XG4gICAgaWYgKGIgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gLTE7XG4gICAgfVxuICAgIHJldHVybiBhIDwgYiA/IC0xIDogMTtcbn07XG52YXIgU29ydERpcmVjdGlvbjtcbihmdW5jdGlvbiAoU29ydERpcmVjdGlvbikge1xuICAgIFNvcnREaXJlY3Rpb25bXCJBU0NcIl0gPSBcImFzY1wiO1xuICAgIFNvcnREaXJlY3Rpb25bXCJERVNDXCJdID0gXCJkZXNjXCI7XG4gICAgU29ydERpcmVjdGlvbltcIk5PTkVcIl0gPSBcIm5vbmVcIjtcbn0pKFNvcnREaXJlY3Rpb24gfHwgKFNvcnREaXJlY3Rpb24gPSB7fSkpO1xuY29uc3Qgc29ydEJ5UHJvcGVydHkgPSAocHJvcCwgY29tcGFyYXRvcikgPT4ge1xuICAgIGNvbnN0IHByb3BHZXR0ZXIgPSBwb2ludGVyKHByb3ApLmdldDtcbiAgICByZXR1cm4gKGEsIGIpID0+IGNvbXBhcmF0b3IocHJvcEdldHRlcihhKSwgcHJvcEdldHRlcihiKSk7XG59O1xuY29uc3QgZGVmYXVsdFNvcnRGYWN0b3J5ID0gKGNvbmYpID0+IHtcbiAgICBjb25zdCB7IHBvaW50ZXI6IHBvaW50ZXIkJDEsIGRpcmVjdGlvbiA9IFwiYXNjXCIgLyogQVNDICovLCBjb21wYXJhdG9yID0gZGVmYXVsdENvbXBhcmF0b3IgfSA9IGNvbmY7XG4gICAgaWYgKCFwb2ludGVyJCQxIHx8IGRpcmVjdGlvbiA9PT0gXCJub25lXCIgLyogTk9ORSAqLykge1xuICAgICAgICByZXR1cm4gKGFycmF5KSA9PiBbLi4uYXJyYXldO1xuICAgIH1cbiAgICBjb25zdCBvcmRlckZ1bmMgPSBzb3J0QnlQcm9wZXJ0eShwb2ludGVyJCQxLCBjb21wYXJhdG9yKTtcbiAgICBjb25zdCBjb21wYXJlRnVuYyA9IGRpcmVjdGlvbiA9PT0gXCJkZXNjXCIgLyogREVTQyAqLyA/IHN3YXAob3JkZXJGdW5jKSA6IG9yZGVyRnVuYztcbiAgICByZXR1cm4gKGFycmF5KSA9PiBbLi4uYXJyYXldLnNvcnQoY29tcGFyZUZ1bmMpO1xufTtcblxuZXhwb3J0IHsgU29ydERpcmVjdGlvbiwgZGVmYXVsdFNvcnRGYWN0b3J5IH07XG4iLCJpbXBvcnQgeyBjb21wb3NlIH0gZnJvbSAnc21hcnQtdGFibGUtb3BlcmF0b3JzJztcbmltcG9ydCB7IHBvaW50ZXIgfSBmcm9tICdzbWFydC10YWJsZS1qc29uLXBvaW50ZXInO1xuXG52YXIgVHlwZTtcbihmdW5jdGlvbiAoVHlwZSkge1xuICAgIFR5cGVbXCJCT09MRUFOXCJdID0gXCJib29sZWFuXCI7XG4gICAgVHlwZVtcIk5VTUJFUlwiXSA9IFwibnVtYmVyXCI7XG4gICAgVHlwZVtcIkRBVEVcIl0gPSBcImRhdGVcIjtcbiAgICBUeXBlW1wiU1RSSU5HXCJdID0gXCJzdHJpbmdcIjtcbn0pKFR5cGUgfHwgKFR5cGUgPSB7fSkpO1xuY29uc3QgdHlwZUV4cHJlc3Npb24gPSAodHlwZSkgPT4ge1xuICAgIHN3aXRjaCAodHlwZSkge1xuICAgICAgICBjYXNlIFR5cGUuQk9PTEVBTjpcbiAgICAgICAgICAgIHJldHVybiBCb29sZWFuO1xuICAgICAgICBjYXNlIFR5cGUuTlVNQkVSOlxuICAgICAgICAgICAgcmV0dXJuIE51bWJlcjtcbiAgICAgICAgY2FzZSBUeXBlLkRBVEU6XG4gICAgICAgICAgICByZXR1cm4gdmFsID0+IG5ldyBEYXRlKHZhbCk7XG4gICAgICAgIGNhc2UgVHlwZS5TVFJJTkc6XG4gICAgICAgICAgICByZXR1cm4gY29tcG9zZShTdHJpbmcsIHZhbCA9PiB2YWwudG9Mb3dlckNhc2UoKSk7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICByZXR1cm4gdmFsID0+IHZhbDtcbiAgICB9XG59O1xudmFyIEZpbHRlck9wZXJhdG9yO1xuKGZ1bmN0aW9uIChGaWx0ZXJPcGVyYXRvcikge1xuICAgIEZpbHRlck9wZXJhdG9yW1wiSU5DTFVERVNcIl0gPSBcImluY2x1ZGVzXCI7XG4gICAgRmlsdGVyT3BlcmF0b3JbXCJJU1wiXSA9IFwiaXNcIjtcbiAgICBGaWx0ZXJPcGVyYXRvcltcIklTX05PVFwiXSA9IFwiaXNOb3RcIjtcbiAgICBGaWx0ZXJPcGVyYXRvcltcIkxPV0VSX1RIQU5cIl0gPSBcImx0XCI7XG4gICAgRmlsdGVyT3BlcmF0b3JbXCJHUkVBVEVSX1RIQU5cIl0gPSBcImd0XCI7XG4gICAgRmlsdGVyT3BlcmF0b3JbXCJHUkVBVEVSX1RIQU5fT1JfRVFVQUxcIl0gPSBcImd0ZVwiO1xuICAgIEZpbHRlck9wZXJhdG9yW1wiTE9XRVJfVEhBTl9PUl9FUVVBTFwiXSA9IFwibHRlXCI7XG4gICAgRmlsdGVyT3BlcmF0b3JbXCJFUVVBTFNcIl0gPSBcImVxdWFsc1wiO1xuICAgIEZpbHRlck9wZXJhdG9yW1wiTk9UX0VRVUFMU1wiXSA9IFwibm90RXF1YWxzXCI7XG4gICAgRmlsdGVyT3BlcmF0b3JbXCJBTllfT0ZcIl0gPSBcImFueU9mXCI7XG59KShGaWx0ZXJPcGVyYXRvciB8fCAoRmlsdGVyT3BlcmF0b3IgPSB7fSkpO1xuY29uc3Qgbm90ID0gZm4gPT4gaW5wdXQgPT4gIWZuKGlucHV0KTtcbmNvbnN0IGlzID0gdmFsdWUgPT4gaW5wdXQgPT4gT2JqZWN0LmlzKHZhbHVlLCBpbnB1dCk7XG5jb25zdCBsdCA9IHZhbHVlID0+IGlucHV0ID0+IGlucHV0IDwgdmFsdWU7XG5jb25zdCBndCA9IHZhbHVlID0+IGlucHV0ID0+IGlucHV0ID4gdmFsdWU7XG5jb25zdCBlcXVhbHMgPSB2YWx1ZSA9PiBpbnB1dCA9PiB2YWx1ZSA9PT0gaW5wdXQ7XG5jb25zdCBpbmNsdWRlcyA9IHZhbHVlID0+IGlucHV0ID0+IGlucHV0LmluY2x1ZGVzKHZhbHVlKTtcbmNvbnN0IGFueU9mID0gdmFsdWUgPT4gaW5wdXQgPT4gdmFsdWUuaW5jbHVkZXMoaW5wdXQpO1xuY29uc3Qgb3BlcmF0b3JzID0ge1xuICAgIFtcImluY2x1ZGVzXCIgLyogSU5DTFVERVMgKi9dOiBpbmNsdWRlcyxcbiAgICBbXCJpc1wiIC8qIElTICovXTogaXMsXG4gICAgW1wiaXNOb3RcIiAvKiBJU19OT1QgKi9dOiBjb21wb3NlKGlzLCBub3QpLFxuICAgIFtcImx0XCIgLyogTE9XRVJfVEhBTiAqL106IGx0LFxuICAgIFtcImd0ZVwiIC8qIEdSRUFURVJfVEhBTl9PUl9FUVVBTCAqL106IGNvbXBvc2UobHQsIG5vdCksXG4gICAgW1wiZ3RcIiAvKiBHUkVBVEVSX1RIQU4gKi9dOiBndCxcbiAgICBbXCJsdGVcIiAvKiBMT1dFUl9USEFOX09SX0VRVUFMICovXTogY29tcG9zZShndCwgbm90KSxcbiAgICBbXCJlcXVhbHNcIiAvKiBFUVVBTFMgKi9dOiBlcXVhbHMsXG4gICAgW1wibm90RXF1YWxzXCIgLyogTk9UX0VRVUFMUyAqL106IGNvbXBvc2UoZXF1YWxzLCBub3QpLFxuICAgIFtcImFueU9mXCIgLyogQU5ZX09GICovXTogYW55T2Zcbn07XG5jb25zdCBldmVyeSA9IGZucyA9PiAoLi4uYXJncykgPT4gZm5zLmV2ZXJ5KGZuID0+IGZuKC4uLmFyZ3MpKTtcbmNvbnN0IHByZWRpY2F0ZSA9ICh7IHZhbHVlID0gJycsIG9wZXJhdG9yID0gXCJpbmNsdWRlc1wiIC8qIElOQ0xVREVTICovLCB0eXBlIH0pID0+IHtcbiAgICBjb25zdCB0eXBlSXQgPSB0eXBlRXhwcmVzc2lvbih0eXBlKTtcbiAgICBjb25zdCBvcGVyYXRlT25UeXBlZCA9IGNvbXBvc2UodHlwZUl0LCBvcGVyYXRvcnNbb3BlcmF0b3JdKTtcbiAgICBjb25zdCBwcmVkaWNhdGVGdW5jID0gb3BlcmF0ZU9uVHlwZWQodmFsdWUpO1xuICAgIHJldHVybiBjb21wb3NlKHR5cGVJdCwgcHJlZGljYXRlRnVuYyk7XG59O1xuLy8gQXZvaWQgdXNlbGVzcyBmaWx0ZXIgbG9va3VwIChpbXByb3ZlIHBlcmYpXG5jb25zdCBub3JtYWxpemVDbGF1c2VzID0gKGNvbmYpID0+IHtcbiAgICBjb25zdCBvdXRwdXQgPSB7fTtcbiAgICBjb25zdCB2YWxpZFBhdGggPSBPYmplY3Qua2V5cyhjb25mKS5maWx0ZXIocGF0aCA9PiBBcnJheS5pc0FycmF5KGNvbmZbcGF0aF0pKTtcbiAgICB2YWxpZFBhdGguZm9yRWFjaChwYXRoID0+IHtcbiAgICAgICAgY29uc3QgdmFsaWRDbGF1c2VzID0gY29uZltwYXRoXS5maWx0ZXIoYyA9PiBjLnZhbHVlICE9PSAnJyk7XG4gICAgICAgIGlmICh2YWxpZENsYXVzZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgb3V0cHV0W3BhdGhdID0gdmFsaWRDbGF1c2VzO1xuICAgICAgICB9XG4gICAgfSk7XG4gICAgcmV0dXJuIG91dHB1dDtcbn07XG5jb25zdCBmaWx0ZXIgPSAoZmlsdGVyKSA9PiB7XG4gICAgY29uc3Qgbm9ybWFsaXplZENsYXVzZXMgPSBub3JtYWxpemVDbGF1c2VzKGZpbHRlcik7XG4gICAgY29uc3QgZnVuY0xpc3QgPSBPYmplY3Qua2V5cyhub3JtYWxpemVkQ2xhdXNlcykubWFwKHBhdGggPT4ge1xuICAgICAgICBjb25zdCBnZXR0ZXIgPSBwb2ludGVyKHBhdGgpLmdldDtcbiAgICAgICAgY29uc3QgY2xhdXNlcyA9IG5vcm1hbGl6ZWRDbGF1c2VzW3BhdGhdLm1hcChwcmVkaWNhdGUpO1xuICAgICAgICByZXR1cm4gY29tcG9zZShnZXR0ZXIsIGV2ZXJ5KGNsYXVzZXMpKTtcbiAgICB9KTtcbiAgICBjb25zdCBmaWx0ZXJQcmVkaWNhdGUgPSBldmVyeShmdW5jTGlzdCk7XG4gICAgcmV0dXJuIGFycmF5ID0+IGFycmF5LmZpbHRlcihmaWx0ZXJQcmVkaWNhdGUpO1xufTtcblxuZXhwb3J0IHsgRmlsdGVyT3BlcmF0b3IsIHByZWRpY2F0ZSwgZmlsdGVyIH07XG4iLCJpbXBvcnQgeyBwb2ludGVyIH0gZnJvbSAnc21hcnQtdGFibGUtanNvbi1wb2ludGVyJztcblxuY29uc3QgYmFzaWMgPSAoaW5wdXQpID0+IHtcbiAgICBjb25zdCB7IHZhbHVlLCBzY29wZSA9IFtdLCBpc0Nhc2VTZW5zaXRpdmUgPSBmYWxzZSB9ID0gaW5wdXQ7XG4gICAgY29uc3Qgc2VhcmNoUG9pbnRlcnMgPSBzY29wZS5tYXAoZmllbGQgPT4gcG9pbnRlcihmaWVsZCkuZ2V0KTtcbiAgICBpZiAoc2NvcGUubGVuZ3RoID09PSAwIHx8ICF2YWx1ZSkge1xuICAgICAgICByZXR1cm4gKGFycmF5KSA9PiBhcnJheTtcbiAgICB9XG4gICAgY29uc3QgdGVzdCA9IGlzQ2FzZVNlbnNpdGl2ZSA9PT0gdHJ1ZSA/IFN0cmluZyh2YWx1ZSkgOiBTdHJpbmcodmFsdWUpLnRvTG93ZXJDYXNlKCk7XG4gICAgcmV0dXJuIChhcnJheSkgPT4gYXJyYXkuZmlsdGVyKGl0ZW0gPT4gc2VhcmNoUG9pbnRlcnMuc29tZShwID0+IHtcbiAgICAgICAgY29uc3QgdiA9IGlzQ2FzZVNlbnNpdGl2ZSA9PT0gdHJ1ZSA/IFN0cmluZyhwKGl0ZW0pKSA6IFN0cmluZyhwKGl0ZW0pKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICByZXR1cm4gdi5pbmNsdWRlcyh0ZXN0KTtcbiAgICB9KSk7XG59O1xuXG5mdW5jdGlvbiByZShzdHJzLCAuLi5zdWJzdHMpIHtcbiAgICBsZXQgcmVTdHIgPSB0cmFuc2Zvcm1SYXcoc3Rycy5yYXdbMF0pO1xuICAgIGZvciAoY29uc3QgW2ksIHN1YnN0XSBvZiBzdWJzdHMuZW50cmllcygpKSB7XG4gICAgICAgIGlmIChzdWJzdCBpbnN0YW5jZW9mIFJlZ0V4cCkge1xuICAgICAgICAgICAgcmVTdHIgKz0gc3Vic3Quc291cmNlO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBzdWJzdCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIHJlU3RyICs9IHF1b3RlVGV4dChzdWJzdCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0lsbGVnYWwgc3Vic3RpdHV0aW9uOiAnK3N1YnN0KTtcbiAgICAgICAgfVxuICAgICAgICByZVN0ciArPSB0cmFuc2Zvcm1SYXcoc3Rycy5yYXdbaSsxXSk7XG4gICAgfVxuICAgIGxldCBmbGFncyA9ICcnO1xuICAgIGlmIChyZVN0ci5zdGFydHNXaXRoKCcvJykpIHtcbiAgICAgICAgY29uc3QgbGFzdFNsYXNoSW5kZXggPSByZVN0ci5sYXN0SW5kZXhPZignLycpO1xuICAgICAgICBpZiAobGFzdFNsYXNoSW5kZXggPT09IDApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSWYgdGhlIGByZWAgc3RyaW5nIHN0YXJ0cyB3aXRoIGEgc2xhc2gsIGl0IG11c3QgZW5kIHdpdGggYSBzZWNvbmQgc2xhc2ggYW5kIHplcm8gb3IgbW9yZSBmbGFnczogJytyZVN0cik7XG4gICAgICAgIH1cbiAgICAgICAgZmxhZ3MgPSByZVN0ci5zbGljZShsYXN0U2xhc2hJbmRleCsxKTtcbiAgICAgICAgcmVTdHIgPSByZVN0ci5zbGljZSgxLCBsYXN0U2xhc2hJbmRleCk7XG4gICAgfVxuICAgIHJldHVybiBuZXcgUmVnRXhwKHJlU3RyLCBmbGFncyk7XG59XG5cbmZ1bmN0aW9uIHRyYW5zZm9ybVJhdyhzdHIpIHtcbiAgICByZXR1cm4gc3RyLnJlcGxhY2UoL1xcXFxgL2csICdgJyk7XG59XG5cbi8qKlxuICogQWxsIHNwZWNpYWwgY2hhcmFjdGVycyBhcmUgZXNjYXBlZCwgYmVjYXVzZSB5b3UgbWF5IHdhbnQgdG8gcXVvdGUgc2V2ZXJhbCBjaGFyYWN0ZXJzIGluc2lkZSBwYXJlbnRoZXNlcyBvciBzcXVhcmUgYnJhY2tldHMuXG4gKi9cbmZ1bmN0aW9uIHF1b3RlVGV4dCh0ZXh0KSB7XG4gICAgcmV0dXJuIHRleHQucmVwbGFjZSgvW1xcXFxeJC4qKz8oKVtcXF17fXw9ITw+Oi1dL2csICdcXFxcJCYnKTtcbn1cblxuY29uc3QgcmVnZXhwID0gKGlucHV0KSA9PiB7XG4gICAgY29uc3QgeyB2YWx1ZSwgc2NvcGUgPSBbXSwgZXNjYXBlID0gZmFsc2UsIGZsYWdzID0gJycgfSA9IGlucHV0O1xuICAgIGNvbnN0IHNlYXJjaFBvaW50ZXJzID0gc2NvcGUubWFwKGZpZWxkID0+IHBvaW50ZXIoZmllbGQpLmdldCk7XG4gICAgaWYgKHNjb3BlLmxlbmd0aCA9PT0gMCB8fCAhdmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIChhcnJheSkgPT4gYXJyYXk7XG4gICAgfVxuICAgIGNvbnN0IHJlZ2V4ID0gZXNjYXBlID09PSB0cnVlID8gcmUgYC8ke3ZhbHVlfS8ke2ZsYWdzfWAgOiBuZXcgUmVnRXhwKHZhbHVlLCBmbGFncyk7XG4gICAgcmV0dXJuIChhcnJheSkgPT4gYXJyYXkuZmlsdGVyKGl0ZW0gPT4gc2VhcmNoUG9pbnRlcnMuc29tZShwID0+IHJlZ2V4LnRlc3QoU3RyaW5nKHAoaXRlbSkpKSkpO1xufTtcblxuZXhwb3J0IHsgYmFzaWMsIHJlZ2V4cCB9O1xuIiwiY29uc3QgZW1pdHRlciA9ICgpID0+IHtcbiAgICBjb25zdCBsaXN0ZW5lcnNMaXN0cyA9IHt9O1xuICAgIGNvbnN0IGluc3RhbmNlID0ge1xuICAgICAgICBvbihldmVudCwgLi4ubGlzdGVuZXJzKSB7XG4gICAgICAgICAgICBsaXN0ZW5lcnNMaXN0c1tldmVudF0gPSAobGlzdGVuZXJzTGlzdHNbZXZlbnRdIHx8IFtdKS5jb25jYXQobGlzdGVuZXJzKTtcbiAgICAgICAgICAgIHJldHVybiBpbnN0YW5jZTtcbiAgICAgICAgfSxcbiAgICAgICAgZGlzcGF0Y2goZXZlbnQsIC4uLmFyZ3MpIHtcbiAgICAgICAgICAgIGNvbnN0IGxpc3RlbmVycyA9IGxpc3RlbmVyc0xpc3RzW2V2ZW50XSB8fCBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgbGlzdGVuZXIgb2YgbGlzdGVuZXJzKSB7XG4gICAgICAgICAgICAgICAgbGlzdGVuZXIoLi4uYXJncyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaW5zdGFuY2U7XG4gICAgICAgIH0sXG4gICAgICAgIG9mZihldmVudCwgLi4ubGlzdGVuZXJzKSB7XG4gICAgICAgICAgICBpZiAoZXZlbnQgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIE9iamVjdC5rZXlzKGxpc3RlbmVyc0xpc3RzKS5mb3JFYWNoKGV2ID0+IGluc3RhbmNlLm9mZihldikpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgY29uc3QgbGlzdCA9IGxpc3RlbmVyc0xpc3RzW2V2ZW50XSB8fCBbXTtcbiAgICAgICAgICAgICAgICBsaXN0ZW5lcnNMaXN0c1tldmVudF0gPSBsaXN0ZW5lcnMubGVuZ3RoID8gbGlzdC5maWx0ZXIobGlzdGVuZXIgPT4gIWxpc3RlbmVycy5pbmNsdWRlcyhsaXN0ZW5lcikpIDogW107XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaW5zdGFuY2U7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJldHVybiBpbnN0YW5jZTtcbn07XG5jb25zdCBwcm94eUxpc3RlbmVyID0gKGV2ZW50TWFwKSA9PiAoeyBlbWl0dGVyIH0pID0+IHtcbiAgICBjb25zdCBldmVudExpc3RlbmVycyA9IHt9O1xuICAgIGNvbnN0IHByb3h5ID0ge1xuICAgICAgICBvZmYoZXYpIHtcbiAgICAgICAgICAgIGlmICghZXYpIHtcbiAgICAgICAgICAgICAgICBPYmplY3Qua2V5cyhldmVudExpc3RlbmVycykuZm9yRWFjaChldmVudE5hbWUgPT4gcHJveHkub2ZmKGV2ZW50TmFtZSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKGV2ZW50TGlzdGVuZXJzW2V2XSkge1xuICAgICAgICAgICAgICAgIGVtaXR0ZXIub2ZmKGV2LCAuLi5ldmVudExpc3RlbmVyc1tldl0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHByb3h5O1xuICAgICAgICB9XG4gICAgfTtcbiAgICBmb3IgKGNvbnN0IGV2IG9mIE9iamVjdC5rZXlzKGV2ZW50TWFwKSkge1xuICAgICAgICBjb25zdCBtZXRob2QgPSBldmVudE1hcFtldl07XG4gICAgICAgIGV2ZW50TGlzdGVuZXJzW2V2XSA9IFtdO1xuICAgICAgICBwcm94eVttZXRob2RdID0gZnVuY3Rpb24gKC4uLmxpc3RlbmVycykge1xuICAgICAgICAgICAgZXZlbnRMaXN0ZW5lcnNbZXZdID0gZXZlbnRMaXN0ZW5lcnNbZXZdLmNvbmNhdChsaXN0ZW5lcnMpO1xuICAgICAgICAgICAgZW1pdHRlci5vbihldiwgLi4ubGlzdGVuZXJzKTtcbiAgICAgICAgICAgIHJldHVybiBwcm94eTtcbiAgICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHByb3h5O1xufTtcblxuZXhwb3J0IHsgZW1pdHRlciwgcHJveHlMaXN0ZW5lciB9O1xuIiwiaW1wb3J0IHsgZGVmYXVsdFNvcnRGYWN0b3J5IH0gZnJvbSAnc21hcnQtdGFibGUtc29ydCc7XG5leHBvcnQgeyBTb3J0RGlyZWN0aW9uIH0gZnJvbSAnc21hcnQtdGFibGUtc29ydCc7XG5pbXBvcnQgeyBmaWx0ZXIgfSBmcm9tICdzbWFydC10YWJsZS1maWx0ZXInO1xuZXhwb3J0IHsgRmlsdGVyT3BlcmF0b3IgfSBmcm9tICdzbWFydC10YWJsZS1maWx0ZXInO1xuaW1wb3J0IHsgcmVnZXhwIH0gZnJvbSAnc21hcnQtdGFibGUtc2VhcmNoJztcbmltcG9ydCB7IGN1cnJ5LCBjb21wb3NlLCB0YXAgfSBmcm9tICdzbWFydC10YWJsZS1vcGVyYXRvcnMnO1xuaW1wb3J0IHsgcG9pbnRlciB9IGZyb20gJ3NtYXJ0LXRhYmxlLWpzb24tcG9pbnRlcic7XG5pbXBvcnQgeyBlbWl0dGVyLCBwcm94eUxpc3RlbmVyIH0gZnJvbSAnc21hcnQtdGFibGUtZXZlbnRzJztcblxuY29uc3Qgc2xpY2VGYWN0b3J5ID0gKHsgcGFnZSA9IDEsIHNpemUgfSA9IHsgcGFnZTogMSB9KSA9PiAoYXJyYXkgPSBbXSkgPT4ge1xuICAgIGNvbnN0IGFjdHVhbFNpemUgPSBzaXplIHx8IGFycmF5Lmxlbmd0aDtcbiAgICBjb25zdCBvZmZzZXQgPSAocGFnZSAtIDEpICogYWN0dWFsU2l6ZTtcbiAgICByZXR1cm4gYXJyYXkuc2xpY2Uob2Zmc2V0LCBvZmZzZXQgKyBhY3R1YWxTaXplKTtcbn07XG5cbnZhciBTbWFydFRhYmxlRXZlbnRzO1xuKGZ1bmN0aW9uIChTbWFydFRhYmxlRXZlbnRzKSB7XG4gICAgU21hcnRUYWJsZUV2ZW50c1tcIlRPR0dMRV9TT1JUXCJdID0gXCJUT0dHTEVfU09SVFwiO1xuICAgIFNtYXJ0VGFibGVFdmVudHNbXCJESVNQTEFZX0NIQU5HRURcIl0gPSBcIkRJU1BMQVlfQ0hBTkdFRFwiO1xuICAgIFNtYXJ0VGFibGVFdmVudHNbXCJQQUdFX0NIQU5HRURcIl0gPSBcIkNIQU5HRV9QQUdFXCI7XG4gICAgU21hcnRUYWJsZUV2ZW50c1tcIkVYRUNfQ0hBTkdFRFwiXSA9IFwiRVhFQ19DSEFOR0VEXCI7XG4gICAgU21hcnRUYWJsZUV2ZW50c1tcIkZJTFRFUl9DSEFOR0VEXCJdID0gXCJGSUxURVJfQ0hBTkdFRFwiO1xuICAgIFNtYXJ0VGFibGVFdmVudHNbXCJTVU1NQVJZX0NIQU5HRURcIl0gPSBcIlNVTU1BUllfQ0hBTkdFRFwiO1xuICAgIFNtYXJ0VGFibGVFdmVudHNbXCJTRUFSQ0hfQ0hBTkdFRFwiXSA9IFwiU0VBUkNIX0NIQU5HRURcIjtcbiAgICBTbWFydFRhYmxlRXZlbnRzW1wiRVhFQ19FUlJPUlwiXSA9IFwiRVhFQ19FUlJPUlwiO1xufSkoU21hcnRUYWJsZUV2ZW50cyB8fCAoU21hcnRUYWJsZUV2ZW50cyA9IHt9KSk7XG5jb25zdCBjdXJyaWVkUG9pbnRlciA9IChwYXRoKSA9PiB7XG4gICAgY29uc3QgeyBnZXQsIHNldCB9ID0gcG9pbnRlcihwYXRoKTtcbiAgICByZXR1cm4geyBnZXQsIHNldDogY3Vycnkoc2V0KSB9O1xufTtcbmNvbnN0IHRhYmxlRGlyZWN0aXZlID0gKHsgc29ydEZhY3RvcnksIHRhYmxlU3RhdGUsIGRhdGEsIGZpbHRlckZhY3RvcnksIHNlYXJjaEZhY3RvcnkgfSkgPT4ge1xuICAgIGxldCBmaWx0ZXJlZENvdW50ID0gZGF0YS5sZW5ndGg7XG4gICAgbGV0IG1hdGNoaW5nSXRlbXMgPSBkYXRhO1xuICAgIGNvbnN0IHRhYmxlID0gZW1pdHRlcigpO1xuICAgIGNvbnN0IHNvcnRQb2ludGVyID0gY3VycmllZFBvaW50ZXIoJ3NvcnQnKTtcbiAgICBjb25zdCBzbGljZVBvaW50ZXIgPSBjdXJyaWVkUG9pbnRlcignc2xpY2UnKTtcbiAgICBjb25zdCBmaWx0ZXJQb2ludGVyID0gY3VycmllZFBvaW50ZXIoJ2ZpbHRlcicpO1xuICAgIGNvbnN0IHNlYXJjaFBvaW50ZXIgPSBjdXJyaWVkUG9pbnRlcignc2VhcmNoJyk7XG4gICAgLy8gV2UgbmVlZCB0byByZWdpc3RlciBpbiBjYXNlIHRoZSBzdW1tYXJ5IGNvbWVzIGZyb20gb3V0c2lkZSAobGlrZSBzZXJ2ZXIgZGF0YSlcbiAgICB0YWJsZS5vbihcIlNVTU1BUllfQ0hBTkdFRFwiIC8qIFNVTU1BUllfQ0hBTkdFRCAqLywgKHsgZmlsdGVyZWRDb3VudDogY291bnQgfSkgPT4ge1xuICAgICAgICBmaWx0ZXJlZENvdW50ID0gY291bnQ7XG4gICAgfSk7XG4gICAgY29uc3Qgc2FmZUFzc2lnbiA9IGN1cnJ5KChiYXNlLCBleHRlbnNpb24pID0+IE9iamVjdC5hc3NpZ24oe30sIGJhc2UsIGV4dGVuc2lvbikpO1xuICAgIGNvbnN0IGRpc3BhdGNoID0gY3VycnkodGFibGUuZGlzcGF0Y2gsIDIpO1xuICAgIGNvbnN0IGRpc3BhdGNoU3VtbWFyeSA9IChmaWx0ZXJlZCkgPT4ge1xuICAgICAgICBtYXRjaGluZ0l0ZW1zID0gZmlsdGVyZWQ7XG4gICAgICAgIHJldHVybiBkaXNwYXRjaChcIlNVTU1BUllfQ0hBTkdFRFwiIC8qIFNVTU1BUllfQ0hBTkdFRCAqLywge1xuICAgICAgICAgICAgcGFnZTogdGFibGVTdGF0ZS5zbGljZS5wYWdlLFxuICAgICAgICAgICAgc2l6ZTogdGFibGVTdGF0ZS5zbGljZS5zaXplLFxuICAgICAgICAgICAgZmlsdGVyZWRDb3VudDogZmlsdGVyZWQubGVuZ3RoXG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgY29uc3QgZXhlYyA9ICh7IHByb2Nlc3NpbmdEZWxheSA9IDIwIH0gPSB7IHByb2Nlc3NpbmdEZWxheTogMjAgfSkgPT4ge1xuICAgICAgICB0YWJsZS5kaXNwYXRjaChcIkVYRUNfQ0hBTkdFRFwiIC8qIEVYRUNfQ0hBTkdFRCAqLywgeyB3b3JraW5nOiB0cnVlIH0pO1xuICAgICAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsdGVyRnVuYyA9IGZpbHRlckZhY3RvcnkoZmlsdGVyUG9pbnRlci5nZXQodGFibGVTdGF0ZSkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlYXJjaEZ1bmMgPSBzZWFyY2hGYWN0b3J5KHNlYXJjaFBvaW50ZXIuZ2V0KHRhYmxlU3RhdGUpKTtcbiAgICAgICAgICAgICAgICBjb25zdCBzb3J0RnVuYyA9IHNvcnRGYWN0b3J5KHNvcnRQb2ludGVyLmdldCh0YWJsZVN0YXRlKSk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2xpY2VGdW5jID0gc2xpY2VGYWN0b3J5KHNsaWNlUG9pbnRlci5nZXQodGFibGVTdGF0ZSkpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGV4ZWNGdW5jID0gY29tcG9zZShmaWx0ZXJGdW5jLCBzZWFyY2hGdW5jLCB0YXAoZGlzcGF0Y2hTdW1tYXJ5KSwgc29ydEZ1bmMsIHNsaWNlRnVuYyk7XG4gICAgICAgICAgICAgICAgY29uc3QgZGlzcGxheWVkID0gZXhlY0Z1bmMoZGF0YSk7XG4gICAgICAgICAgICAgICAgdGFibGUuZGlzcGF0Y2goXCJESVNQTEFZX0NIQU5HRURcIiAvKiBESVNQTEFZX0NIQU5HRUQgKi8sIGRpc3BsYXllZC5tYXAoZCA9PiAoe1xuICAgICAgICAgICAgICAgICAgICBpbmRleDogZGF0YS5pbmRleE9mKGQpLFxuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogZFxuICAgICAgICAgICAgICAgIH0pKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBjYXRjaCAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdGFibGUuZGlzcGF0Y2goXCJFWEVDX0VSUk9SXCIgLyogRVhFQ19FUlJPUiAqLywgZXJyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpbmFsbHkge1xuICAgICAgICAgICAgICAgIHRhYmxlLmRpc3BhdGNoKFwiRVhFQ19DSEFOR0VEXCIgLyogRVhFQ19DSEFOR0VEICovLCB7IHdvcmtpbmc6IGZhbHNlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LCBwcm9jZXNzaW5nRGVsYXkpO1xuICAgIH07XG4gICAgY29uc3QgdXBkYXRlVGFibGVTdGF0ZSA9IGN1cnJ5KChwdGVyLCBldiwgbmV3UGFydGlhbFN0YXRlKSA9PiBjb21wb3NlKHNhZmVBc3NpZ24ocHRlci5nZXQodGFibGVTdGF0ZSkpLCB0YXAoZGlzcGF0Y2goZXYpKSwgcHRlci5zZXQodGFibGVTdGF0ZSkpKG5ld1BhcnRpYWxTdGF0ZSkpO1xuICAgIGNvbnN0IHJlc2V0VG9GaXJzdFBhZ2UgPSAoKSA9PiB1cGRhdGVUYWJsZVN0YXRlKHNsaWNlUG9pbnRlciwgXCJDSEFOR0VfUEFHRVwiIC8qIFBBR0VfQ0hBTkdFRCAqLywgeyBwYWdlOiAxIH0pO1xuICAgIGNvbnN0IHRhYmxlT3BlcmF0aW9uID0gKHB0ZXIsIGV2KSA9PiBjb21wb3NlKHVwZGF0ZVRhYmxlU3RhdGUocHRlciwgZXYpLCByZXNldFRvRmlyc3RQYWdlLCAoKSA9PiB0YWJsZS5leGVjKCkgLy8gV2Ugd3JhcCB3aXRoaW4gYSBmdW5jdGlvbiBzbyB0YWJsZS5leGVjIGNhbiBiZSBvdmVyd3JpdHRlbiAod2hlbiB1c2luZyB3aXRoIGEgc2VydmVyIGZvciBleGFtcGxlKVxuICAgICk7XG4gICAgY29uc3QgYXBpID0ge1xuICAgICAgICBzb3J0OiB0YWJsZU9wZXJhdGlvbihzb3J0UG9pbnRlciwgXCJUT0dHTEVfU09SVFwiIC8qIFRPR0dMRV9TT1JUICovKSxcbiAgICAgICAgZmlsdGVyOiB0YWJsZU9wZXJhdGlvbihmaWx0ZXJQb2ludGVyLCBcIkZJTFRFUl9DSEFOR0VEXCIgLyogRklMVEVSX0NIQU5HRUQgKi8pLFxuICAgICAgICBzZWFyY2g6IHRhYmxlT3BlcmF0aW9uKHNlYXJjaFBvaW50ZXIsIFwiU0VBUkNIX0NIQU5HRURcIiAvKiBTRUFSQ0hfQ0hBTkdFRCAqLyksXG4gICAgICAgIHNsaWNlOiBjb21wb3NlKHVwZGF0ZVRhYmxlU3RhdGUoc2xpY2VQb2ludGVyLCBcIkNIQU5HRV9QQUdFXCIgLyogUEFHRV9DSEFOR0VEICovKSwgKCkgPT4gdGFibGUuZXhlYygpKSxcbiAgICAgICAgZXhlYyxcbiAgICAgICAgYXN5bmMgZXZhbChzdGF0ZSA9IHRhYmxlU3RhdGUpIHtcbiAgICAgICAgICAgIGNvbnN0IHNvcnRGdW5jID0gc29ydEZhY3Rvcnkoc29ydFBvaW50ZXIuZ2V0KHN0YXRlKSk7XG4gICAgICAgICAgICBjb25zdCBzZWFyY2hGdW5jID0gc2VhcmNoRmFjdG9yeShzZWFyY2hQb2ludGVyLmdldChzdGF0ZSkpO1xuICAgICAgICAgICAgY29uc3QgZmlsdGVyRnVuYyA9IGZpbHRlckZhY3RvcnkoZmlsdGVyUG9pbnRlci5nZXQoc3RhdGUpKTtcbiAgICAgICAgICAgIGNvbnN0IHNsaWNlRnVuYyA9IHNsaWNlRmFjdG9yeShzbGljZVBvaW50ZXIuZ2V0KHN0YXRlKSk7XG4gICAgICAgICAgICBjb25zdCBleGVjRnVuYyA9IGNvbXBvc2UoZmlsdGVyRnVuYywgc2VhcmNoRnVuYywgc29ydEZ1bmMsIHNsaWNlRnVuYyk7XG4gICAgICAgICAgICByZXR1cm4gZXhlY0Z1bmMoZGF0YSkubWFwKGQgPT4gKHsgaW5kZXg6IGRhdGEuaW5kZXhPZihkKSwgdmFsdWU6IGQgfSkpO1xuICAgICAgICB9LFxuICAgICAgICBvbkRpc3BsYXlDaGFuZ2UoZm4pIHtcbiAgICAgICAgICAgIHRhYmxlLm9uKFwiRElTUExBWV9DSEFOR0VEXCIgLyogRElTUExBWV9DSEFOR0VEICovLCBmbik7XG4gICAgICAgIH0sXG4gICAgICAgIGdldFRhYmxlU3RhdGUoKSB7XG4gICAgICAgICAgICBjb25zdCBzb3J0ID0gT2JqZWN0LmFzc2lnbih7fSwgdGFibGVTdGF0ZS5zb3J0KTtcbiAgICAgICAgICAgIGNvbnN0IHNlYXJjaCA9IE9iamVjdC5hc3NpZ24oe30sIHRhYmxlU3RhdGUuc2VhcmNoKTtcbiAgICAgICAgICAgIGNvbnN0IHNsaWNlID0gT2JqZWN0LmFzc2lnbih7fSwgdGFibGVTdGF0ZS5zbGljZSk7XG4gICAgICAgICAgICBjb25zdCBmaWx0ZXIgPSB7fTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgcHJvcCBvZiBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh0YWJsZVN0YXRlLmZpbHRlcikpIHtcbiAgICAgICAgICAgICAgICBmaWx0ZXJbcHJvcF0gPSB0YWJsZVN0YXRlLmZpbHRlcltwcm9wXS5tYXAodiA9PiBPYmplY3QuYXNzaWduKHt9LCB2KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4geyBzb3J0LCBzZWFyY2gsIHNsaWNlLCBmaWx0ZXIgfTtcbiAgICAgICAgfSxcbiAgICAgICAgZ2V0TWF0Y2hpbmdJdGVtcygpIHtcbiAgICAgICAgICAgIHJldHVybiBbLi4ubWF0Y2hpbmdJdGVtc107XG4gICAgICAgIH1cbiAgICB9O1xuICAgIGNvbnN0IGluc3RhbmNlID0gT2JqZWN0LmFzc2lnbih0YWJsZSwgYXBpKTtcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyhpbnN0YW5jZSwge1xuICAgICAgICBmaWx0ZXJlZENvdW50OiB7XG4gICAgICAgICAgICBnZXQoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZpbHRlcmVkQ291bnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG4gICAgICAgIGxlbmd0aDoge1xuICAgICAgICAgICAgZ2V0KCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBkYXRhLmxlbmd0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiBpbnN0YW5jZTtcbn07XG5cbmNvbnN0IGZpbHRlckxpc3RlbmVyID0gcHJveHlMaXN0ZW5lcih7IFtcIkZJTFRFUl9DSEFOR0VEXCIgLyogRklMVEVSX0NIQU5HRUQgKi9dOiAnb25GaWx0ZXJDaGFuZ2UnIH0pO1xuLy8gdG9kbyBleHBvc2UgYW5kIHJlLWV4cG9ydCBmcm9tIHNtYXJ0LXRhYmxlLWZpbHRlclxudmFyIEZpbHRlclR5cGU7XG4oZnVuY3Rpb24gKEZpbHRlclR5cGUpIHtcbiAgICBGaWx0ZXJUeXBlW1wiQk9PTEVBTlwiXSA9IFwiYm9vbGVhblwiO1xuICAgIEZpbHRlclR5cGVbXCJOVU1CRVJcIl0gPSBcIm51bWJlclwiO1xuICAgIEZpbHRlclR5cGVbXCJEQVRFXCJdID0gXCJkYXRlXCI7XG4gICAgRmlsdGVyVHlwZVtcIlNUUklOR1wiXSA9IFwic3RyaW5nXCI7XG59KShGaWx0ZXJUeXBlIHx8IChGaWx0ZXJUeXBlID0ge30pKTtcbmNvbnN0IGZpbHRlckRpcmVjdGl2ZSA9ICh7IHRhYmxlLCBwb2ludGVyLCBvcGVyYXRvciA9IFwiaW5jbHVkZXNcIiAvKiBJTkNMVURFUyAqLywgdHlwZSA9IFwic3RyaW5nXCIgLyogU1RSSU5HICovIH0pID0+IHtcbiAgICBjb25zdCBwcm94eSA9IGZpbHRlckxpc3RlbmVyKHsgZW1pdHRlcjogdGFibGUgfSk7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24oe1xuICAgICAgICBmaWx0ZXIoaW5wdXQpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpbHRlckNvbmYgPSB7XG4gICAgICAgICAgICAgICAgW3BvaW50ZXJdOiBbXG4gICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhbHVlOiBpbnB1dCxcbiAgICAgICAgICAgICAgICAgICAgICAgIG9wZXJhdG9yLFxuICAgICAgICAgICAgICAgICAgICAgICAgdHlwZVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIHJldHVybiB0YWJsZS5maWx0ZXIoZmlsdGVyQ29uZik7XG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRlKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRhYmxlLmdldFRhYmxlU3RhdGUoKS5maWx0ZXI7XG4gICAgICAgIH1cbiAgICB9LCBwcm94eSk7XG59O1xuXG5jb25zdCBzZWFyY2hMaXN0ZW5lciA9IHByb3h5TGlzdGVuZXIoeyBbXCJTRUFSQ0hfQ0hBTkdFRFwiIC8qIFNFQVJDSF9DSEFOR0VEICovXTogJ29uU2VhcmNoQ2hhbmdlJyB9KTtcbmNvbnN0IHNlYXJjaERpcmVjdGl2ZSA9ICh7IHRhYmxlLCBzY29wZSA9IFtdIH0pID0+IHtcbiAgICBjb25zdCBwcm94eSA9IHNlYXJjaExpc3RlbmVyKHsgZW1pdHRlcjogdGFibGUgfSk7XG4gICAgcmV0dXJuIE9iamVjdC5hc3NpZ24ocHJveHksIHtcbiAgICAgICAgc2VhcmNoKGlucHV0LCBvcHRzID0ge30pIHtcbiAgICAgICAgICAgIHJldHVybiB0YWJsZS5zZWFyY2goT2JqZWN0LmFzc2lnbih7fSwgeyB2YWx1ZTogaW5wdXQsIHNjb3BlIH0sIG9wdHMpKTtcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGUoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGFibGUuZ2V0VGFibGVTdGF0ZSgpLnNlYXJjaDtcbiAgICAgICAgfVxuICAgIH0sIHByb3h5KTtcbn07XG5cbmNvbnN0IHNsaWNlTGlzdGVuZXIgPSBwcm94eUxpc3RlbmVyKHtcbiAgICBbXCJDSEFOR0VfUEFHRVwiIC8qIFBBR0VfQ0hBTkdFRCAqL106ICdvblBhZ2VDaGFuZ2UnLFxuICAgIFtcIlNVTU1BUllfQ0hBTkdFRFwiIC8qIFNVTU1BUllfQ0hBTkdFRCAqL106ICdvblN1bW1hcnlDaGFuZ2UnXG59KTtcbmNvbnN0IHBhZ2luYXRpb25EaXJlY3RpdmUgPSAoeyB0YWJsZSB9KSA9PiB7XG4gICAgbGV0IHsgc2xpY2U6IHsgcGFnZTogY3VycmVudFBhZ2UsIHNpemU6IGN1cnJlbnRTaXplIH0gfSA9IHRhYmxlLmdldFRhYmxlU3RhdGUoKTtcbiAgICBsZXQgaXRlbUxpc3RMZW5ndGggPSB0YWJsZS5maWx0ZXJlZENvdW50O1xuICAgIGNvbnN0IHByb3h5ID0gc2xpY2VMaXN0ZW5lcih7IGVtaXR0ZXI6IHRhYmxlIH0pO1xuICAgIGNvbnN0IGFwaSA9IHtcbiAgICAgICAgc2VsZWN0UGFnZShwKSB7XG4gICAgICAgICAgICByZXR1cm4gdGFibGUuc2xpY2UoeyBwYWdlOiBwLCBzaXplOiBjdXJyZW50U2l6ZSB9KTtcbiAgICAgICAgfSxcbiAgICAgICAgc2VsZWN0TmV4dFBhZ2UoKSB7XG4gICAgICAgICAgICByZXR1cm4gYXBpLnNlbGVjdFBhZ2UoY3VycmVudFBhZ2UgKyAxKTtcbiAgICAgICAgfSxcbiAgICAgICAgc2VsZWN0UHJldmlvdXNQYWdlKCkge1xuICAgICAgICAgICAgcmV0dXJuIGFwaS5zZWxlY3RQYWdlKGN1cnJlbnRQYWdlIC0gMSk7XG4gICAgICAgIH0sXG4gICAgICAgIGNoYW5nZVBhZ2VTaXplKHNpemUpIHtcbiAgICAgICAgICAgIHJldHVybiB0YWJsZS5zbGljZSh7IHBhZ2U6IDEsIHNpemUgfSk7XG4gICAgICAgIH0sXG4gICAgICAgIGlzUHJldmlvdXNQYWdlRW5hYmxlZCgpIHtcbiAgICAgICAgICAgIHJldHVybiBjdXJyZW50UGFnZSA+IDE7XG4gICAgICAgIH0sXG4gICAgICAgIGlzTmV4dFBhZ2VFbmFibGVkKCkge1xuICAgICAgICAgICAgcmV0dXJuIE1hdGguY2VpbChpdGVtTGlzdExlbmd0aCAvIGN1cnJlbnRTaXplKSA+IGN1cnJlbnRQYWdlO1xuICAgICAgICB9LFxuICAgICAgICBzdGF0ZSgpIHtcbiAgICAgICAgICAgIHJldHVybiBPYmplY3QuYXNzaWduKHRhYmxlLmdldFRhYmxlU3RhdGUoKS5zbGljZSwgeyBmaWx0ZXJlZENvdW50OiBpdGVtTGlzdExlbmd0aCB9KTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgY29uc3QgZGlyZWN0aXZlID0gT2JqZWN0LmFzc2lnbihhcGksIHByb3h5KTtcbiAgICBkaXJlY3RpdmUub25TdW1tYXJ5Q2hhbmdlKCh7IHBhZ2U6IHAsIHNpemU6IHMsIGZpbHRlcmVkQ291bnQgfSkgPT4ge1xuICAgICAgICBjdXJyZW50UGFnZSA9IHA7XG4gICAgICAgIGN1cnJlbnRTaXplID0gcztcbiAgICAgICAgaXRlbUxpc3RMZW5ndGggPSBmaWx0ZXJlZENvdW50O1xuICAgIH0pO1xuICAgIHJldHVybiBkaXJlY3RpdmU7XG59O1xuXG5jb25zdCBkZWJvdW5jZSA9IChmbiwgdGltZSkgPT4ge1xuICAgIGxldCB0aW1lciA9IG51bGw7XG4gICAgcmV0dXJuICguLi5hcmdzKSA9PiB7XG4gICAgICAgIGlmICh0aW1lciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVyKTtcbiAgICAgICAgfVxuICAgICAgICB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4gZm4oLi4uYXJncyksIHRpbWUpO1xuICAgIH07XG59O1xuY29uc3Qgc29ydExpc3RlbmVycyA9IHByb3h5TGlzdGVuZXIoeyBbXCJUT0dHTEVfU09SVFwiIC8qIFRPR0dMRV9TT1JUICovXTogJ29uU29ydFRvZ2dsZScgfSk7XG5jb25zdCBkaXJlY3Rpb25zID0gW1wiYXNjXCIgLyogQVNDICovLCBcImRlc2NcIiAvKiBERVNDICovXTtcbmNvbnN0IHNvcnREaXJlY3RpdmUgPSAoeyBwb2ludGVyLCB0YWJsZSwgY3ljbGUgPSBmYWxzZSwgZGVib3VuY2VUaW1lID0gMCB9KSA9PiB7XG4gICAgY29uc3QgY3ljbGVEaXJlY3Rpb25zID0gY3ljbGUgPT09IHRydWUgPyBbXCJub25lXCIgLyogTk9ORSAqL10uY29uY2F0KGRpcmVjdGlvbnMpIDogWy4uLmRpcmVjdGlvbnNdLnJldmVyc2UoKTtcbiAgICBjb25zdCBjb21taXQgPSBkZWJvdW5jZSh0YWJsZS5zb3J0LCBkZWJvdW5jZVRpbWUpO1xuICAgIGxldCBoaXQgPSAwO1xuICAgIGNvbnN0IHByb3h5ID0gc29ydExpc3RlbmVycyh7IGVtaXR0ZXI6IHRhYmxlIH0pO1xuICAgIGNvbnN0IGRpcmVjdGl2ZSA9IE9iamVjdC5hc3NpZ24oe1xuICAgICAgICB0b2dnbGUoKSB7XG4gICAgICAgICAgICBoaXQrKztcbiAgICAgICAgICAgIGNvbnN0IGRpcmVjdGlvbiA9IGN5Y2xlRGlyZWN0aW9uc1toaXQgJSBjeWNsZURpcmVjdGlvbnMubGVuZ3RoXTtcbiAgICAgICAgICAgIHJldHVybiBjb21taXQoeyBwb2ludGVyLCBkaXJlY3Rpb24gfSk7XG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRlKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRhYmxlLmdldFRhYmxlU3RhdGUoKS5zb3J0O1xuICAgICAgICB9XG4gICAgfSwgcHJveHkpO1xuICAgIGRpcmVjdGl2ZS5vblNvcnRUb2dnbGUoKHsgcG9pbnRlcjogcCB9KSA9PiB7XG4gICAgICAgIGhpdCA9IHBvaW50ZXIgIT09IHAgPyAwIDogaGl0O1xuICAgIH0pO1xuICAgIGNvbnN0IHsgcG9pbnRlcjogc3RhdGVQb2ludGVyLCBkaXJlY3Rpb24gPSBcImFzY1wiIC8qIEFTQyAqLyB9ID0gZGlyZWN0aXZlLnN0YXRlKCk7XG4gICAgaGl0ID0gc3RhdGVQb2ludGVyID09PSBwb2ludGVyID8gKGRpcmVjdGlvbiA9PT0gXCJhc2NcIiAvKiBBU0MgKi8gPyAxIDogMikgOiAwO1xuICAgIHJldHVybiBkaXJlY3RpdmU7XG59O1xuXG5jb25zdCBzdW1tYXJ5TGlzdGVuZXIgPSBwcm94eUxpc3RlbmVyKHsgW1wiU1VNTUFSWV9DSEFOR0VEXCIgLyogU1VNTUFSWV9DSEFOR0VEICovXTogJ29uU3VtbWFyeUNoYW5nZScgfSk7XG5jb25zdCBzdW1tYXJ5RGlyZWN0aXZlID0gKHsgdGFibGUgfSkgPT4gc3VtbWFyeUxpc3RlbmVyKHsgZW1pdHRlcjogdGFibGUgfSk7XG5cbmNvbnN0IGV4ZWN1dGlvbkxpc3RlbmVyID0gcHJveHlMaXN0ZW5lcih7IFtcIkVYRUNfQ0hBTkdFRFwiIC8qIEVYRUNfQ0hBTkdFRCAqL106ICdvbkV4ZWN1dGlvbkNoYW5nZScgfSk7XG5jb25zdCB3b3JraW5nSW5kaWNhdG9yRGlyZWN0aXZlID0gKHsgdGFibGUgfSkgPT4gZXhlY3V0aW9uTGlzdGVuZXIoeyBlbWl0dGVyOiB0YWJsZSB9KTtcblxuY29uc3QgZGVmYXVsdFRhYmxlU3RhdGUgPSAoKSA9PiAoeyBzb3J0OiB7fSwgc2xpY2U6IHsgcGFnZTogMSB9LCBmaWx0ZXI6IHt9LCBzZWFyY2g6IHt9IH0pO1xuY29uc3Qgc21hcnRUYWJsZSA9ICh7IHNvcnRGYWN0b3J5ID0gZGVmYXVsdFNvcnRGYWN0b3J5LCBmaWx0ZXJGYWN0b3J5ID0gZmlsdGVyLCBzZWFyY2hGYWN0b3J5ID0gcmVnZXhwLCB0YWJsZVN0YXRlID0gZGVmYXVsdFRhYmxlU3RhdGUoKSwgZGF0YSA9IFtdIH0gPSB7XG4gICAgc29ydEZhY3Rvcnk6IGRlZmF1bHRTb3J0RmFjdG9yeSxcbiAgICBmaWx0ZXJGYWN0b3J5OiBmaWx0ZXIsXG4gICAgc2VhcmNoRmFjdG9yeTogcmVnZXhwLFxuICAgIHRhYmxlU3RhdGU6IGRlZmF1bHRUYWJsZVN0YXRlKCksXG4gICAgZGF0YTogW11cbn0sIC4uLnRhYmxlRXh0ZW5zaW9ucykgPT4ge1xuICAgIGNvbnN0IGNvcmVUYWJsZSA9IHRhYmxlRGlyZWN0aXZlKHsgc29ydEZhY3RvcnksIGZpbHRlckZhY3RvcnksIHRhYmxlU3RhdGUsIGRhdGEsIHNlYXJjaEZhY3RvcnkgfSk7XG4gICAgcmV0dXJuIHRhYmxlRXh0ZW5zaW9ucy5yZWR1Y2UoKGFjY3VtdWxhdG9yLCBuZXdkaXIpID0+IE9iamVjdC5hc3NpZ24oYWNjdW11bGF0b3IsIG5ld2Rpcih7XG4gICAgICAgIHNvcnRGYWN0b3J5LFxuICAgICAgICBmaWx0ZXJGYWN0b3J5LFxuICAgICAgICBzZWFyY2hGYWN0b3J5LFxuICAgICAgICB0YWJsZVN0YXRlLFxuICAgICAgICBkYXRhLFxuICAgICAgICB0YWJsZTogY29yZVRhYmxlXG4gICAgfSkpLCBjb3JlVGFibGUpO1xufTtcblxuZXhwb3J0IHsgRmlsdGVyVHlwZSwgU21hcnRUYWJsZUV2ZW50cywgZmlsdGVyRGlyZWN0aXZlLCBwYWdpbmF0aW9uRGlyZWN0aXZlLCBzZWFyY2hEaXJlY3RpdmUsIHNsaWNlRmFjdG9yeSwgc21hcnRUYWJsZSwgc29ydERpcmVjdGl2ZSwgc3VtbWFyeURpcmVjdGl2ZSwgdGFibGVEaXJlY3RpdmUsIHdvcmtpbmdJbmRpY2F0b3JEaXJlY3RpdmUgfTtcbiIsImltcG9ydCB7d29ya2luZ0luZGljYXRvckRpcmVjdGl2ZX0gZnJvbSAnc21hcnQtdGFibGUtY29yZSc7XG5cbmV4cG9ydCBjb25zdCBsb2FkaW5nSW5kaWNhdG9yID0gKHt0YWJsZSwgZWx9KSA9PiB7XG4gICAgY29uc3QgY29tcG9uZW50ID0gd29ya2luZ0luZGljYXRvckRpcmVjdGl2ZSh7dGFibGV9KTtcbiAgICBjb21wb25lbnQub25FeGVjdXRpb25DaGFuZ2UoZnVuY3Rpb24gKHt3b3JraW5nfSkge1xuICAgICAgICBlbC5jbGFzc0xpc3QucmVtb3ZlKCdzdC13b3JraW5nJyk7XG4gICAgICAgIGlmICh3b3JraW5nID09PSB0cnVlKSB7XG4gICAgICAgICAgICBlbC5jbGFzc0xpc3QuYWRkKCdzdC13b3JraW5nJyk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gY29tcG9uZW50O1xufTtcbiIsImltcG9ydCB7c29ydERpcmVjdGl2ZX0gZnJvbSAnc21hcnQtdGFibGUtY29yZSc7XG5cbmV4cG9ydCBjb25zdCBzb3J0ID0gKHtlbCwgdGFibGUsIGNvbmYgPSB7fX0pID0+IHtcbiAgICBjb25zdCBwb2ludGVyID0gY29uZi5wb2ludGVyIHx8IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1zdC1zb3J0Jyk7XG4gICAgY29uc3QgY3ljbGUgPSBjb25mLmN5Y2xlIHx8IGVsLmhhc0F0dHJpYnV0ZSgnZGF0YS1zdC1zb3J0LWN5Y2xlJyk7XG4gICAgY29uc3QgY29tcG9uZW50ID0gc29ydERpcmVjdGl2ZSh7cG9pbnRlciwgdGFibGUsIGN5Y2xlfSk7XG4gICAgY29tcG9uZW50Lm9uU29ydFRvZ2dsZSgoe3BvaW50ZXI6IGN1cnJlbnRQb2ludGVyLCBkaXJlY3Rpb259KSA9PiB7XG4gICAgICAgIGVsLmNsYXNzTGlzdC5yZW1vdmUoJ3N0LXNvcnQtYXNjJywgJ3N0LXNvcnQtZGVzYycpO1xuICAgICAgICBpZiAocG9pbnRlciA9PT0gY3VycmVudFBvaW50ZXIgJiYgZGlyZWN0aW9uICE9PSAnbm9uZScpIHtcbiAgICAgICAgICAgIGNvbnN0IGNsYXNzTmFtZSA9IGRpcmVjdGlvbiA9PT0gJ2FzYycgPyAnc3Qtc29ydC1hc2MnIDogJ3N0LXNvcnQtZGVzYyc7XG4gICAgICAgICAgICBlbC5jbGFzc0xpc3QuYWRkKGNsYXNzTmFtZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICBjb25zdCBldmVudExpc3RlbmVyID0gKCkgPT4gY29tcG9uZW50LnRvZ2dsZSgpO1xuICAgIGVsLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgZXZlbnRMaXN0ZW5lcik7XG4gICAgcmV0dXJuIGNvbXBvbmVudDtcbn07XG4iLCJleHBvcnQgZnVuY3Rpb24gZGVib3VuY2UoZm4sIGRlbGF5KSB7XG4gICAgbGV0IHRpbWVvdXRJZDtcbiAgICByZXR1cm4gKGV2KSA9PiB7XG4gICAgICAgIGlmICh0aW1lb3V0SWQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgICAgICB9XG4gICAgICAgIHRpbWVvdXRJZCA9IHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgZm4oZXYpO1xuICAgICAgICB9LCBkZWxheSk7XG4gICAgfTtcbn1cbiIsImltcG9ydCB7ZmlsdGVyRGlyZWN0aXZlfSBmcm9tICdzbWFydC10YWJsZS1jb3JlJztcbmltcG9ydCB7ZGVib3VuY2V9IGZyb20gJy4vaGVscGVycyc7XG5cbmV4cG9ydCBjb25zdCBmaWx0ZXIgPSAoe3RhYmxlLCBlbCwgZGVsYXkgPSA0MDAsIGNvbmYgPSB7fX0pID0+IHtcbiAgICBjb25zdCBwb2ludGVyID0gY29uZi5wb2ludGVyIHx8IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1zdC1maWx0ZXInKTtcbiAgICBjb25zdCBvcGVyYXRvciA9IGNvbmYub3BlcmF0b3IgfHwgZWwuZ2V0QXR0cmlidXRlKCdkYXRhLXN0LWZpbHRlci1vcGVyYXRvcicpIHx8ICdpbmNsdWRlcyc7XG4gICAgY29uc3QgZWxUeXBlID0gZWwuaGFzQXR0cmlidXRlKCd0eXBlJykgPyBlbC5nZXRBdHRyaWJ1dGUoJ3R5cGUnKSA6ICdzdHJpbmcnO1xuICAgIGxldCB0eXBlID0gY29uZi50eXBlIHx8IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1zdC1maWx0ZXItdHlwZScpO1xuICAgIGlmICghdHlwZSkge1xuICAgICAgICB0eXBlID0gWydkYXRlJywgJ251bWJlciddLmluY2x1ZGVzKGVsVHlwZSkgPyBlbFR5cGUgOiAnc3RyaW5nJztcbiAgICB9XG4gICAgY29uc3QgY29tcG9uZW50ID0gZmlsdGVyRGlyZWN0aXZlKHt0YWJsZSwgcG9pbnRlciwgdHlwZSwgb3BlcmF0b3J9KTtcbiAgICBjb25zdCBldmVudExpc3RlbmVyID0gZGVib3VuY2UoZXYgPT4gY29tcG9uZW50LmZpbHRlcihlbC52YWx1ZSksIGRlbGF5KTtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGV2ZW50TGlzdGVuZXIpO1xuICAgIGlmIChlbC50YWdOYW1lID09PSAnU0VMRUNUJykge1xuICAgICAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdjaGFuZ2UnLCBldmVudExpc3RlbmVyKTtcbiAgICB9XG4gICAgcmV0dXJuIGNvbXBvbmVudDtcbn07XG4iLCJpbXBvcnQge3NlYXJjaERpcmVjdGl2ZX0gZnJvbSAnc21hcnQtdGFibGUtY29yZSc7XG5pbXBvcnQge2RlYm91bmNlfSBmcm9tICcuL2hlbHBlcnMnO1xuXG5leHBvcnQgY29uc3Qgc2VhcmNoID0gKHtlbCwgdGFibGUsIGRlbGF5ID0gNDAwLCBjb25mID0ge319KSA9PiB7XG4gICAgY29uc3Qgc2NvcGUgPSBjb25mLnNjb3BlIHx8IChlbC5nZXRBdHRyaWJ1dGUoJ2RhdGEtc3Qtc2VhcmNoJykgfHwgJycpXG4gICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgIC5tYXAocyA9PiBzLnRyaW0oKSk7XG4gICAgY29uc3QgZmxhZ3MgPSBjb25mLmZsYWdzIHx8IGVsLmdldEF0dHJpYnV0ZSgnZGF0YS1zdC1zZWFyY2gtZmxhZ3MnKSB8fCAnJztcbiAgICBjb25zdCBjb21wb25lbnQgPSBzZWFyY2hEaXJlY3RpdmUoe3RhYmxlLCBzY29wZX0pO1xuICAgIGNvbnN0IGV2ZW50TGlzdGVuZXIgPSBkZWJvdW5jZSgoKSA9PiB7XG4gICAgICAgIGNvbXBvbmVudC5zZWFyY2goZWwudmFsdWUsIHtmbGFnc30pO1xuICAgIH0sIGRlbGF5KTtcbiAgICBlbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGV2ZW50TGlzdGVuZXIpO1xufTtcbiIsImltcG9ydCB7bG9hZGluZ0luZGljYXRvciBhcyBsb2FkaW5nfSBmcm9tICcuL2xvYWRpbmdJbmRpY2F0b3InO1xuaW1wb3J0IHtzb3J0fSBmcm9tICcuL3NvcnQnO1xuaW1wb3J0IHtmaWx0ZXJ9IGZyb20gJy4vZmlsdGVycyc7XG5pbXBvcnQge3NlYXJjaCBhcyBzZWFyY2hJbnB1dH0gZnJvbSAnLi9zZWFyY2gnO1xuXG5leHBvcnQgY29uc3QgdGFibGUgPSAoe2VsLCB0YWJsZX0pID0+IHtcbiAgICBjb25zdCBib290RGlyZWN0aXZlID0gKGZhY3RvcnksIHNlbGVjdG9yKSA9PiBBcnJheS5mcm9tKGVsLnF1ZXJ5U2VsZWN0b3JBbGwoc2VsZWN0b3IpKS5mb3JFYWNoKGVsID0+IGZhY3Rvcnkoe1xuICAgICAgICBlbCxcbiAgICAgICAgdGFibGVcbiAgICB9KSk7XG4gICAgLy8gYm9vdFxuICAgIGJvb3REaXJlY3RpdmUoc29ydCwgJ1tkYXRhLXN0LXNvcnRdJyk7XG4gICAgYm9vdERpcmVjdGl2ZShsb2FkaW5nLCAnW2RhdGEtc3QtbG9hZGluZy1pbmRpY2F0b3JdJyk7XG4gICAgYm9vdERpcmVjdGl2ZShzZWFyY2hJbnB1dCwgJ1tkYXRhLXN0LXNlYXJjaF0nKTtcbiAgICBib290RGlyZWN0aXZlKGZpbHRlciwgJ1tkYXRhLXN0LWZpbHRlcl0nKTtcblxuICAgIHJldHVybiB0YWJsZTtcbn07XG4iLCJleHBvcnQgZGVmYXVsdCBmdW5jdGlvbiAoe25hbWU6e2ZpcnN0OmZpcnN0TmFtZSwgbGFzdDpsYXN0TmFtZX0sIGdlbmRlciwgYmlydGhEYXRlLCBzaXplfSkge1xuICBjb25zdCB0ciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3RyJyk7XG4gIHRyLmlubmVySFRNTCA9IGA8dGQ+JHtsYXN0TmFtZX08L3RkPjx0ZD4ke2ZpcnN0TmFtZX08L3RkPjx0ZD4ke2dlbmRlcn08L3RkPjx0ZD4ke2JpcnRoRGF0ZS50b0xvY2FsZURhdGVTdHJpbmcoKX08L3RkPjx0ZD4ke3NpemV9PC90ZD5gO1xuICByZXR1cm4gdHI7XG59IiwiaW1wb3J0IHtzdW1tYXJ5RGlyZWN0aXZlfSAgZnJvbSAnc21hcnQtdGFibGUtY29yZSdcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gc3VtbWFyeUNvbXBvbmVudCAoe3RhYmxlLCBlbH0pIHtcbiAgY29uc3QgZGlyID0gc3VtbWFyeURpcmVjdGl2ZSh7dGFibGV9KTtcbiAgZGlyLm9uU3VtbWFyeUNoYW5nZSgoe3BhZ2UsIHNpemUsIGZpbHRlcmVkQ291bnR9KSA9PiB7XG4gICAgZWwuaW5uZXJIVE1MID0gYHNob3dpbmcgaXRlbXMgPHN0cm9uZz4keyhwYWdlIC0gMSkgKiBzaXplICsgKGZpbHRlcmVkQ291bnQgPiAwID8gMSA6IDApfTwvc3Ryb25nPiAtIDxzdHJvbmc+JHtNYXRoLm1pbihmaWx0ZXJlZENvdW50LCBwYWdlICogc2l6ZSl9PC9zdHJvbmc+IG9mIDxzdHJvbmc+JHtmaWx0ZXJlZENvdW50fTwvc3Ryb25nPiBtYXRjaGluZyBpdGVtc2A7XG4gIH0pO1xuICByZXR1cm4gZGlyO1xufSIsImltcG9ydCB7cGFnaW5hdGlvbkRpcmVjdGl2ZX0gZnJvbSAnc21hcnQtdGFibGUtY29yZSc7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIHBhZ2luYXRpb25Db21wb25lbnQgKHt0YWJsZSwgZWx9KSB7XG4gIGNvbnN0IHByZXZpb3VzQnV0dG9uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJyk7XG4gIHByZXZpb3VzQnV0dG9uLmlubmVySFRNTCA9ICdQcmV2aW91cyc7XG4gIGNvbnN0IG5leHRCdXR0b24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdidXR0b24nKTtcbiAgbmV4dEJ1dHRvbi5pbm5lckhUTUwgPSAnTmV4dCc7XG4gIGNvbnN0IHBhZ2VTcGFuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnc3BhbicpO1xuICBwYWdlU3Bhbi5pbm5lckhUTUwgPSAnLSBwYWdlIDEgLSc7XG4gIGNvbnN0IGNvbXAgPSBwYWdpbmF0aW9uRGlyZWN0aXZlKHt0YWJsZX0pO1xuXG4gIGNvbXAub25TdW1tYXJ5Q2hhbmdlKCh7cGFnZX0pID0+IHtcbiAgICBwcmV2aW91c0J1dHRvbi5kaXNhYmxlZCA9ICFjb21wLmlzUHJldmlvdXNQYWdlRW5hYmxlZCgpO1xuICAgIG5leHRCdXR0b24uZGlzYWJsZWQgPSAhY29tcC5pc05leHRQYWdlRW5hYmxlZCgpO1xuICAgIHBhZ2VTcGFuLmlubmVySFRNTCA9IGAtICR7cGFnZX0gLWA7XG4gIH0pO1xuXG4gIHByZXZpb3VzQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gY29tcC5zZWxlY3RQcmV2aW91c1BhZ2UoKSk7XG4gIG5leHRCdXR0b24uYWRkRXZlbnRMaXN0ZW5lcignY2xpY2snLCAoKSA9PiBjb21wLnNlbGVjdE5leHRQYWdlKCkpO1xuXG4gIGVsLmFwcGVuZENoaWxkKHByZXZpb3VzQnV0dG9uKTtcbiAgZWwuYXBwZW5kQ2hpbGQocGFnZVNwYW4pO1xuICBlbC5hcHBlbmRDaGlsZChuZXh0QnV0dG9uKTtcblxuICByZXR1cm4gY29tcDtcbn0iLCJpbXBvcnQge2RlYm91bmNlfSBmcm9tICdzbWFydC10YWJsZS12YW5pbGxhJztcblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gcmFuZ1NpemVJbnB1dCAoe21pbkVsLCBtYXhFbCwgdGFibGV9KSB7XG5cbiAgbGV0IGx0VmFsdWU7XG4gIGxldCBndFZhbHVlO1xuXG4gIGNvbnN0IGNvbW1pdCA9ICgpID0+IHtcbiAgICBjb25zdCBjbGF1c2VzID0gW107XG4gICAgaWYgKGx0VmFsdWUpIHtcbiAgICAgIGNsYXVzZXMucHVzaCh7dmFsdWU6IGx0VmFsdWUsIG9wZXJhdG9yOiAnbHRlJywgdHlwZTogJ251bWJlcid9KTtcbiAgICB9XG4gICAgaWYgKGd0VmFsdWUpIHtcbiAgICAgIGNsYXVzZXMucHVzaCh7dmFsdWU6IGd0VmFsdWUsIG9wZXJhdG9yOiAnZ3RlJywgdHlwZTogJ251bWJlcid9KTtcbiAgICB9XG4gICAgdGFibGUuZmlsdGVyKHtcbiAgICAgIHNpemU6IGNsYXVzZXNcbiAgICB9KVxuICB9O1xuXG4gIG1pbkVsLmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgZGVib3VuY2UoKGV2KSA9PiB7XG4gICAgZ3RWYWx1ZSA9IG1pbkVsLnZhbHVlO1xuICAgIGNvbW1pdCgpO1xuICB9LCA0MDApKTtcblxuICBtYXhFbC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGRlYm91bmNlKChldikgPT4ge1xuICAgIGx0VmFsdWUgPSBtYXhFbC52YWx1ZTtcbiAgICBjb21taXQoKTtcbiAgfSwgNDAwKSk7XG59IiwiZXhwb3J0IGRlZmF1bHQgICh7cXVlcnl9KSA9PiAoe3RhYmxlLCB0YWJsZVN0YXRlfSkgPT4ge1xuICBjb25zdCBleGVjID0gKCkgPT4ge1xuICAgIHRhYmxlLmRpc3BhdGNoKCdFWEVDX0NIQU5HRUQnLCB7d29ya2luZzogdHJ1ZX0pO1xuICAgIHJldHVybiBxdWVyeSh0YWJsZVN0YXRlKVxuICAgICAgLnRoZW4oKHtkYXRhID0gW10sIHN1bW1hcnkgPSB7fX0pID0+IHtcbiAgICAgICAgdGFibGUuZGlzcGF0Y2goJ1NVTU1BUllfQ0hBTkdFRCcsIHN1bW1hcnkpO1xuICAgICAgICB0YWJsZS5kaXNwYXRjaCgnRElTUExBWV9DSEFOR0VEJywgZGF0YSk7XG4gICAgICAgIHRhYmxlLmRpc3BhdGNoKCdFWEVDX0NIQU5HRUQnLCB7d29ya2luZzogZmFsc2V9KTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZSA9PiB7XG4gICAgICAgIHRhYmxlLmRpc3BhdGNoKCdFWEVDX0VSUk9SJywgZSk7XG4gICAgICAgIHRhYmxlLmRpc3BhdGNoKCdFWEVDX0NIQU5HRUQnLCB7d29ya2luZzogZmFsc2V9KTtcbiAgICAgIH0pO1xuICB9O1xuXG4gIHJldHVybiBPYmplY3QuYXNzaWduKHRhYmxlLCB7XG4gICAgZXhlYywgZXZhbDogKHRzID0gdGFibGVTdGF0ZSkgPT4gcXVlcnkodHMpLnRoZW4oKHtkYXRhfSkgPT4gZGF0YSlcbiAgfSk7XG59OyIsIi8vYSBmYWtlIHNkayB0byBtaW1pYyBhIHNlcnZlcjogaXQgYWN0dWFsbHkgdXNlcyBhbm90aGVyIHNtYXJ0LXRhYmxlIHRvIHByb2Nlc3MgYSBxdWVyeSBhbmQgcmV0dXJuIHRoZSByZXN1bHQgd2l0aCBhIHJhbmRvbSB0aW1lb3V0IHRvIG1pbWljIHRoZSBodHRwIHJlc3BvbnNlIHRpbWVcbmltcG9ydCB7c21hcnRUYWJsZSBhcyB0YWJsZX0gZnJvbSAnc21hcnQtdGFibGUtY29yZSc7XG5cbmV4cG9ydCBkZWZhdWx0ICgpID0+IHtcbiAgY29uc3QgdCA9IHRhYmxlKHtkYXRhfSk7XG4gIHJldHVybiB7XG4gICAgcXVlcnk6ICh0YWJsZVN0YXRlKSA9PiB7XG4gICAgICByZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAvL3RoaXMgdGltZW91dCBpcyBqdXN0IHRvIGF2b2lkIHRoZSB1aSB0byBmcmVlemUgYXMgbm9ybWFsbHkgdGhlIHByb2Nlc3Mgd291bGQgcnVuIG9uIHRoZSBzZXJ2ZXJcbiAgICAgICAgc2V0VGltZW91dChmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgY29uc3Qgbm90U2xpY2VkU3RhdGUgPSBPYmplY3QuYXNzaWduKHt9LCB0YWJsZVN0YXRlLCB7XG4gICAgICAgICAgICBzbGljZToge3BhZ2U6IDF9XG4gICAgICAgICAgfSk7XG4gICAgICAgICAgUHJvbWlzZVxuICAgICAgICAgICAgLmFsbChbdC5ldmFsKHRhYmxlU3RhdGUpLCB0LmV2YWwobm90U2xpY2VkU3RhdGUpXSlcbiAgICAgICAgICAgIC50aGVuKChbZnVsbCwgcGFydGlhbF0pID0+IHtcbiAgICAgICAgICAgICAgLy9yYW5kb20gdGltZW91dCBvbiB0aGUgcmVzcG9uc2UgdG8gbWltaWMgdGhlIHNlcnZlciByZXNwb25zZSB0aW1lXG4gICAgICAgICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgICAgICAgIHJlc29sdmUoe1xuICAgICAgICAgICAgICAgICAgZGF0YTogZnVsbCxcbiAgICAgICAgICAgICAgICAgIHN1bW1hcnk6IHtcbiAgICAgICAgICAgICAgICAgICAgcGFnZTogdGFibGVTdGF0ZS5zbGljZS5wYWdlLFxuICAgICAgICAgICAgICAgICAgICBzaXplOiB0YWJsZVN0YXRlLnNsaWNlLnNpemUsXG4gICAgICAgICAgICAgICAgICAgIGZpbHRlcmVkQ291bnQ6IHBhcnRpYWwubGVuZ3RoXG4gICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIH0sIE1hdGgucmFuZG9tKCkgKiAyMDAwKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAuY2F0Y2goZSA9PiByZWplY3QoZSkpO1xuICAgICAgICB9LCAyMClcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcbn07XG5cblxuIiwiaW1wb3J0IHt0YWJsZSBhcyB0YWJsZUNvbXBvbmVudEZhY3Rvcnl9IGZyb20gJ3NtYXJ0LXRhYmxlLXZhbmlsbGEnO1xuaW1wb3J0IHtzbWFydFRhYmxlIGFzIHRhYmxlfSBmcm9tICdzbWFydC10YWJsZS1jb3JlJztcbmltcG9ydCByb3cgZnJvbSAnLi9jb21wb25lbnRzL3Jvdyc7XG5pbXBvcnQgc3VtbWFyeSBmcm9tICcuL2NvbXBvbmVudHMvc3VtbWFyeSc7XG5pbXBvcnQgcGFnaW5hdGlvbiBmcm9tICcuL2NvbXBvbmVudHMvcGFnaW5hdGlvbic7XG5pbXBvcnQgcmFuZ2VTaXplSW5wdXQgZnJvbSAnLi9jb21wb25lbnRzL3JhbmdlU2l6ZUlucHV0JztcbmltcG9ydCBleHQgZnJvbSAnLi4vaW5kZXgnO1xuaW1wb3J0IHNkayBmcm9tICcuL3Nkayc7XG5cbmNvbnN0IGVsID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ3RhYmxlLWNvbnRhaW5lcicpO1xuY29uc3QgdGJvZHkgPSBlbC5xdWVyeVNlbGVjdG9yKCd0Ym9keScpO1xuY29uc3Qgc3VtbWFyeUVsID0gZWwucXVlcnlTZWxlY3RvcignW2RhdGEtc3Qtc3VtbWFyeV0nKTtcblxuY29uc3QgdCA9IHRhYmxlKFxuICB7dGFibGVTdGF0ZToge3NvcnQ6IHt9LCBmaWx0ZXI6IHt9LCBzbGljZToge3BhZ2U6IDEsIHNpemU6IDIwfX19LFxuICBleHQoc2RrKCkpIC8vc2VydmVyIHNpZGUgZXh0ZW5zaW9uXG4pO1xuY29uc3QgdGFibGVDb21wb25lbnQgPSB0YWJsZUNvbXBvbmVudEZhY3Rvcnkoe2VsLCB0YWJsZTogdH0pO1xuXG5zdW1tYXJ5KHt0YWJsZTogdCwgZWw6IHN1bW1hcnlFbH0pO1xucmFuZ2VTaXplSW5wdXQoe1xuICB0YWJsZTogdCxcbiAgbWluRWw6IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdtaW4tc2l6ZScpLFxuICBtYXhFbDogZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoJ21heC1zaXplJylcbn0pO1xuXG5jb25zdCBwYWdpbmF0aW9uQ29udGFpbmVyID0gZWwucXVlcnlTZWxlY3RvcignW2RhdGEtc3QtcGFnaW5hdGlvbl0nKTtcbnBhZ2luYXRpb24oe3RhYmxlOiB0LCBlbDogcGFnaW5hdGlvbkNvbnRhaW5lcn0pO1xuXG50YWJsZUNvbXBvbmVudC5vbkRpc3BsYXlDaGFuZ2UoZGlzcGxheWVkID0+IHtcbiAgdGJvZHkuaW5uZXJIVE1MID0gJyc7XG4gIGZvciAobGV0IHIgb2YgZGlzcGxheWVkKSB7XG4gICAgY29uc3QgbmV3Q2hpbGQgPSByb3coKHIudmFsdWUpLCByLmluZGV4LCB0KTtcbiAgICB0Ym9keS5hcHBlbmRDaGlsZChuZXdDaGlsZCk7XG4gIH1cbn0pO1xuIl0sIm5hbWVzIjpbImRlYm91bmNlIiwiZmlsdGVyIiwibG9hZGluZyIsInNlYXJjaElucHV0IiwidGFibGUiLCJ0YWJsZUNvbXBvbmVudEZhY3RvcnkiLCJzdW1tYXJ5IiwicmFuZ2VTaXplSW5wdXQiLCJwYWdpbmF0aW9uIl0sIm1hcHBpbmdzIjoiOzs7SUFBQSxNQUFNLElBQUksR0FBRyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQztJQUN0QyxNQUFNLE9BQU8sR0FBRyxDQUFDLEtBQUssRUFBRSxHQUFHLEdBQUcsS0FBSyxDQUFDLEdBQUcsSUFBSSxLQUFLLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxRQUFRLEVBQUUsT0FBTyxLQUFLLE9BQU8sQ0FBQyxRQUFRLENBQUMsRUFBRSxLQUFLLENBQUMsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDO0lBQ3JILE1BQU0sS0FBSyxHQUFHLENBQUMsRUFBRSxFQUFFLFNBQVMsS0FBSztJQUNqQyxJQUFJLE1BQU0sS0FBSyxHQUFHLFNBQVMsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDO0lBQ3pDLElBQUksT0FBTyxDQUFDLEdBQUcsSUFB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
