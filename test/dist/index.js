(function () {
  'use strict';

  /**
   * slice() reference.
   */

  var slice = Array.prototype.slice;

  /**
   * Expose `co`.
   */

  var index = co['default'] = co.co = co;

  /**
   * Wrap the given generator `fn` into a
   * function that returns a promise.
   * This is a separate function so that
   * every `co()` call doesn't create a new,
   * unnecessary closure.
   *
   * @param {GeneratorFunction} fn
   * @return {Function}
   * @api public
   */

  co.wrap = function (fn) {
    createPromise.__generatorFunction__ = fn;
    return createPromise;
    function createPromise() {
      return co.call(this, fn.apply(this, arguments));
    }
  };

  /**
   * Execute the generator function or a generator
   * and return a promise.
   *
   * @param {Function} fn
   * @return {Promise}
   * @api public
   */

  function co(gen) {
    var ctx = this;
    var args = slice.call(arguments, 1);

    // we wrap everything in a promise to avoid promise chaining,
    // which leads to memory leak errors.
    // see https://github.com/tj/co/issues/180
    return new Promise(function(resolve, reject) {
      if (typeof gen === 'function') gen = gen.apply(ctx, args);
      if (!gen || typeof gen.next !== 'function') return resolve(gen);

      onFulfilled();

      /**
       * @param {Mixed} res
       * @return {Promise}
       * @api private
       */

      function onFulfilled(res) {
        var ret;
        try {
          ret = gen.next(res);
        } catch (e) {
          return reject(e);
        }
        next(ret);
      }

      /**
       * @param {Error} err
       * @return {Promise}
       * @api private
       */

      function onRejected(err) {
        var ret;
        try {
          ret = gen.throw(err);
        } catch (e) {
          return reject(e);
        }
        next(ret);
      }

      /**
       * Get the next value in the generator,
       * return a promise.
       *
       * @param {Object} ret
       * @return {Promise}
       * @api private
       */

      function next(ret) {
        if (ret.done) return resolve(ret.value);
        var value = toPromise.call(ctx, ret.value);
        if (value && isPromise(value)) return value.then(onFulfilled, onRejected);
        return onRejected(new TypeError('You may only yield a function, promise, generator, array, or object, '
          + 'but the following object was passed: "' + String(ret.value) + '"'));
      }
    });
  }

  /**
   * Convert a `yield`ed value into a promise.
   *
   * @param {Mixed} obj
   * @return {Promise}
   * @api private
   */

  function toPromise(obj) {
    if (!obj) return obj;
    if (isPromise(obj)) return obj;
    if (isGeneratorFunction(obj) || isGenerator(obj)) return co.call(this, obj);
    if ('function' == typeof obj) return thunkToPromise.call(this, obj);
    if (Array.isArray(obj)) return arrayToPromise.call(this, obj);
    if (isObject(obj)) return objectToPromise.call(this, obj);
    return obj;
  }

  /**
   * Convert a thunk to a promise.
   *
   * @param {Function}
   * @return {Promise}
   * @api private
   */

  function thunkToPromise(fn) {
    var ctx = this;
    return new Promise(function (resolve, reject) {
      fn.call(ctx, function (err, res) {
        if (err) return reject(err);
        if (arguments.length > 2) res = slice.call(arguments, 1);
        resolve(res);
      });
    });
  }

  /**
   * Convert an array of "yieldables" to a promise.
   * Uses `Promise.all()` internally.
   *
   * @param {Array} obj
   * @return {Promise}
   * @api private
   */

  function arrayToPromise(obj) {
    return Promise.all(obj.map(toPromise, this));
  }

  /**
   * Convert an object of "yieldables" to a promise.
   * Uses `Promise.all()` internally.
   *
   * @param {Object} obj
   * @return {Promise}
   * @api private
   */

  function objectToPromise(obj){
    var results = new obj.constructor();
    var keys = Object.keys(obj);
    var promises = [];
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var promise = toPromise.call(this, obj[key]);
      if (promise && isPromise(promise)) defer(promise, key);
      else results[key] = obj[key];
    }
    return Promise.all(promises).then(function () {
      return results;
    });

    function defer(promise, key) {
      // predefine the key in the result
      results[key] = undefined;
      promises.push(promise.then(function (res) {
        results[key] = res;
      }));
    }
  }

  /**
   * Check if `obj` is a promise.
   *
   * @param {Object} obj
   * @return {Boolean}
   * @api private
   */

  function isPromise(obj) {
    return 'function' == typeof obj.then;
  }

  /**
   * Check if `obj` is a generator.
   *
   * @param {Mixed} obj
   * @return {Boolean}
   * @api private
   */

  function isGenerator(obj) {
    return 'function' == typeof obj.next && 'function' == typeof obj.throw;
  }

  /**
   * Check if `obj` is a generator function.
   *
   * @param {Mixed} obj
   * @return {Boolean}
   * @api private
   */
  function isGeneratorFunction(obj) {
    var constructor = obj.constructor;
    if (!constructor) return false;
    if ('GeneratorFunction' === constructor.name || 'GeneratorFunction' === constructor.displayName) return true;
    return isGenerator(constructor.prototype);
  }

  /**
   * Check for plain object.
   *
   * @param {Mixed} val
   * @return {Boolean}
   * @api private
   */

  function isObject(val) {
    return Object == val.constructor;
  }

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  var keys = createCommonjsModule(function (module, exports) {
  exports = module.exports = typeof Object.keys === 'function'
    ? Object.keys : shim;

  exports.shim = shim;
  function shim (obj) {
    var keys = [];
    for (var key in obj) keys.push(key);
    return keys;
  }
  });

  var is_arguments = createCommonjsModule(function (module, exports) {
  var supportsArgumentsClass = (function(){
    return Object.prototype.toString.call(arguments)
  })() == '[object Arguments]';

  exports = module.exports = supportsArgumentsClass ? supported : unsupported;

  exports.supported = supported;
  function supported(object) {
    return Object.prototype.toString.call(object) == '[object Arguments]';
  }

  exports.unsupported = unsupported;
  function unsupported(object){
    return object &&
      typeof object == 'object' &&
      typeof object.length == 'number' &&
      Object.prototype.hasOwnProperty.call(object, 'callee') &&
      !Object.prototype.propertyIsEnumerable.call(object, 'callee') ||
      false;
  }
  });

  var index$1 = createCommonjsModule(function (module) {
  var pSlice = Array.prototype.slice;
  var objectKeys = keys;
  var isArguments = is_arguments;

  var deepEqual = module.exports = function (actual, expected, opts) {
    if (!opts) opts = {};
    // 7.1. All identical values are equivalent, as determined by ===.
    if (actual === expected) {
      return true;

    } else if (actual instanceof Date && expected instanceof Date) {
      return actual.getTime() === expected.getTime();

    // 7.3. Other pairs that do not both pass typeof value == 'object',
    // equivalence is determined by ==.
    } else if (!actual || !expected || typeof actual != 'object' && typeof expected != 'object') {
      return opts.strict ? actual === expected : actual == expected;

    // 7.4. For all other Object pairs, including Array objects, equivalence is
    // determined by having the same number of owned properties (as verified
    // with Object.prototype.hasOwnProperty.call), the same set of keys
    // (although not necessarily the same order), equivalent values for every
    // corresponding key, and an identical 'prototype' property. Note: this
    // accounts for both named and indexed properties on Arrays.
    } else {
      return objEquiv(actual, expected, opts);
    }
  };

  function isUndefinedOrNull(value) {
    return value === null || value === undefined;
  }

  function isBuffer (x) {
    if (!x || typeof x !== 'object' || typeof x.length !== 'number') return false;
    if (typeof x.copy !== 'function' || typeof x.slice !== 'function') {
      return false;
    }
    if (x.length > 0 && typeof x[0] !== 'number') return false;
    return true;
  }

  function objEquiv(a, b, opts) {
    var i, key;
    if (isUndefinedOrNull(a) || isUndefinedOrNull(b))
      return false;
    // an identical 'prototype' property.
    if (a.prototype !== b.prototype) return false;
    //~~~I've managed to break Object.keys through screwy arguments passing.
    //   Converting to array solves the problem.
    if (isArguments(a)) {
      if (!isArguments(b)) {
        return false;
      }
      a = pSlice.call(a);
      b = pSlice.call(b);
      return deepEqual(a, b, opts);
    }
    if (isBuffer(a)) {
      if (!isBuffer(b)) {
        return false;
      }
      if (a.length !== b.length) return false;
      for (i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
      }
      return true;
    }
    try {
      var ka = objectKeys(a),
          kb = objectKeys(b);
    } catch (e) {//happens when one is a string literal and the other isn't
      return false;
    }
    // having the same number of owned properties (keys incorporates
    // hasOwnProperty)
    if (ka.length != kb.length)
      return false;
    //the same set of keys (although not necessarily the same order),
    ka.sort();
    kb.sort();
    //~~~cheap key test
    for (i = ka.length - 1; i >= 0; i--) {
      if (ka[i] != kb[i])
        return false;
    }
    //equivalent values for every corresponding key, and
    //~~~possibly expensive deep test
    for (i = ka.length - 1; i >= 0; i--) {
      key = ka[i];
      if (!deepEqual(a[key], b[key], opts)) return false;
    }
    return typeof a === typeof b;
  }
  });

  const assertions = {
    ok(val, message = 'should be truthy') {
      const assertionResult = {
        pass: Boolean(val),
        expected: 'truthy',
        actual: val,
        operator: 'ok',
        message
      };
      this.test.addAssertion(assertionResult);
      return assertionResult;
    },
    deepEqual(actual, expected, message = 'should be equivalent') {
      const assertionResult = {
        pass: index$1(actual, expected),
        actual,
        expected,
        message,
        operator: 'deepEqual'
      };
      this.test.addAssertion(assertionResult);
      return assertionResult;
    },
    equal(actual, expected, message = 'should be equal') {
      const assertionResult = {
        pass: actual === expected,
        actual,
        expected,
        message,
        operator: 'equal'
      };
      this.test.addAssertion(assertionResult);
      return assertionResult;
    },
    notOk(val, message = 'should not be truthy') {
      const assertionResult = {
        pass: !Boolean(val),
        expected: 'falsy',
        actual: val,
        operator: 'notOk',
        message
      };
      this.test.addAssertion(assertionResult);
      return assertionResult;
    },
    notDeepEqual(actual, expected, message = 'should not be equivalent') {
      const assertionResult = {
        pass: !index$1(actual, expected),
        actual,
        expected,
        message,
        operator: 'notDeepEqual'
      };
      this.test.addAssertion(assertionResult);
      return assertionResult;
    },
    notEqual(actual, expected, message = 'should not be equal') {
      const assertionResult = {
        pass: actual !== expected,
        actual,
        expected,
        message,
        operator: 'notEqual'
      };
      this.test.addAssertion(assertionResult);
      return assertionResult;
    },
    throws(func, expected, message) {
      let caught, pass, actual;
      if (typeof expected === 'string') {
        [expected, message] = [message, expected];
      }
      try {
        func();
      } catch (error) {
        caught = {error};
      }
      pass = caught !== undefined;
      actual = caught && caught.error;
      if (expected instanceof RegExp) {
        pass = expected.test(actual) || expected.test(actual && actual.message);
        expected = String(expected);
      } else if (typeof expected === 'function' && caught) {
        pass = actual instanceof expected;
        actual = actual.constructor;
      }
      const assertionResult = {
        pass,
        expected,
        actual,
        operator: 'throws',
        message: message || 'should throw'
      };
      this.test.addAssertion(assertionResult);
      return assertionResult;
    },
    doesNotThrow(func, expected, message) {
      let caught;
      if (typeof expected === 'string') {
        [expected, message] = [message, expected];
      }
      try {
        func();
      } catch (error) {
        caught = {error};
      }
      const assertionResult = {
        pass: caught === undefined,
        expected: 'no thrown error',
        actual: caught && caught.error,
        operator: 'doesNotThrow',
        message: message || 'should not throw'
      };
      this.test.addAssertion(assertionResult);
      return assertionResult;
    },
    fail(reason = 'fail called') {
      const assertionResult = {
        pass: false,
        actual: 'fail called',
        expected: 'fail not called',
        message: reason,
        operator: 'fail'
      };
      this.test.addAssertion(assertionResult);
      return assertionResult;
    }
  };

  function assertion (test) {
    return Object.create(assertions, {test: {value: test}});
  }

  const Test = {
    run: function () {
      const assert = assertion(this);
      const now = Date.now();
      return index(this.coroutine(assert))
        .then(() => {
          return {assertions: this.assertions, executionTime: Date.now() - now};
        });
    },
    addAssertion(){
      const newAssertions = [...arguments].map(a => Object.assign({description: this.description}, a));
      this.assertions.push(...newAssertions);
      return this;
    }
  };

  function test ({description, coroutine, only = false}) {
    return Object.create(Test, {
      description: {value: description},
      coroutine: {value: coroutine},
      assertions: {value: []},
      only: {value: only},
      length: {
        get(){
          return this.assertions.length
        }
      }
    });
  }

  function tapOut ({pass, message, index}) {
    const status = pass === true ? 'ok' : 'not ok';
    console.log([status, index, message].join(' '));
  }

  function canExit () {
    return typeof process !== 'undefined' && typeof process.exit === 'function';
  }

  function tap () {
    return function * () {
      let index = 1;
      let lastId = 0;
      let success = 0;
      let failure = 0;

      const starTime = Date.now();
      console.log('TAP version 13');
      try {
        while (true) {
          const assertion = yield;
          if (assertion.pass === true) {
            success++;
          } else {
            failure++;
          }
          assertion.index = index;
          if (assertion.id !== lastId) {
            console.log(`# ${assertion.description} - ${assertion.executionTime}ms`);
            lastId = assertion.id;
          }
          tapOut(assertion);
          if (assertion.pass !== true) {
            console.log(`  ---
  operator: ${assertion.operator}
  expected: ${JSON.stringify(assertion.expected)}
  actual: ${JSON.stringify(assertion.actual)}
  ...`);
          }
          index++;
        }
      } catch (e) {
        console.log('Bail out! unhandled exception');
        console.log(e);
        if (canExit()) {
          process.exit(1);
        }
      }
      finally {
        const execution = Date.now() - starTime;
        if (index > 1) {
          console.log(`
1..${index - 1}
# duration ${execution}ms
# success ${success}
# failure ${failure}`);
        }
        if (failure && canExit()) {
          process.exit(1);
        }
      }
    };
  }

  const Plan = {
    test(description, coroutine, opts = {}){
      const testItems = (!coroutine && description.tests) ? [...description] : [{description, coroutine}];
      this.tests.push(...testItems.map(t=>test(Object.assign(t, opts))));
      return this;
    },

    only(description, coroutine){
      return this.test(description, coroutine, {only: true});
    },

    run(sink = tap()){
      const sinkIterator = sink();
      sinkIterator.next();
      const hasOnly = this.tests.some(t=>t.only);
      const runnable = hasOnly ? this.tests.filter(t=>t.only) : this.tests;
      return index(function * () {
        let id = 1;
        try {
          const results = runnable.map(t=>t.run());
          for (let r of results) {
            const {assertions, executionTime} = yield r;
            for (let assert of assertions) {
              sinkIterator.next(Object.assign(assert, {id, executionTime}));
            }
            id++;
          }
        }
        catch (e) {
          sinkIterator.throw(e);
        } finally {
          sinkIterator.return();
        }
      }.bind(this))
    },

    * [Symbol.iterator](){
      for (let t of this.tests) {
        yield t;
      }
    }
  };

  function plan () {
    return Object.create(Plan, {
      tests: {value: []},
      length: {
        get(){
          return this.tests.length
        }
      }
    });
  }

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
  const tap$1 = (fn) => arg => {
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
                  const execFunc = compose(filterFunc, searchFunc, tap$1(dispatchSummary), sortFunc, sliceFunc);
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
      const updateTableState = curry((pter, ev, newPartialState) => compose(safeAssign(pter.get(tableState)), tap$1(dispatch(ev)), pter.set(tableState))(newPartialState));
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
  // todo expose and re-export from smart-table-filter
  var FilterType;
  (function (FilterType) {
      FilterType["BOOLEAN"] = "boolean";
      FilterType["NUMBER"] = "number";
      FilterType["DATE"] = "date";
      FilterType["STRING"] = "string";
  })(FilterType || (FilterType = {}));

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

  plan()
    .test('should dispatch working state change', function * (t) {
      let workingState;
      const tb = smartTable({data: []}, ext({query: (tableState) => Promise.resolve({summary: {}, data: []})}));
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
      const tb = smartTable({data: []}, ext({query: (tableState) => Promise.reject(error)}));
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
      const tb = smartTable({data: []}, ext({
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
      const tb = smartTable({data: []}, ext({
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
      const tb = smartTable({data: []}, ext({
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

}());
//# sourceMappingURL=index.js.map
