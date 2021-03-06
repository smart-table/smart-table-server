import {table as tableComponentFactory} from 'smart-table-vanilla';
import {table} from 'smart-table-core';
import row from './components/row';
import summary from './components/summary';
import pagination from './components/pagination';
import rangeSizeInput from './components/rangeSizeInput';
import ext from '../index';
import sdk from './sdk';

const el = document.getElementById('table-container');
const tbody = el.querySelector('tbody');
const summaryEl = el.querySelector('[data-st-summary]');

const t = table(
  {tableState: {sort: {}, filter: {}, slice: {page: 1, size: 20}}},
  ext(sdk()) //server side extension
);
const tableComponent = tableComponentFactory({el, table: t});

summary({table: t, el: summaryEl});
rangeSizeInput({
  table: t,
  minEl: document.getElementById('min-size'),
  maxEl: document.getElementById('max-size')
});

const paginationContainer = el.querySelector('[data-st-pagination]');
pagination({table: t, el: paginationContainer});

tableComponent.onDisplayChange(displayed => {
  tbody.innerHTML = '';
  for (let r of displayed) {
    const newChild = row((r.value), r.index, t);
    tbody.appendChild(newChild);
  }
});
