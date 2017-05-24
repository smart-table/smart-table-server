# smart-table-server

[![CircleCI](https://circleci.com/gh/smart-table/smart-table-server.svg?style=svg)](https://circleci.com/gh/smart-table/smart-table-server)

[smart-table](https://smart-table.github.io/www/dist/) extension which allows you to move your business logic from the client to the server without (barely) changing your client code. Ideal when your data is fetched through an http api using AJAX.

see [demo]()

## Installation

### yarn

``yarn add smart-table-server``

### npm

``npm install --save smart-table-server``

## Usage

The module is a factory which takes as argument an object with a **query** function.

The query function (likely your server sdk) must returns a promise which will eventually resolve with an object with the following properties
* **data**: an array containing your data
* **summary**: an object containing the summary information (see [smart-table documentation](https://smart-table.github.io/www/dist/) for more example.

The function takes as argument the current table state.

### example

```Javascript
import {table} from 'smart-table-core';
import ext from 'smart-table-server';

const st = table({data:[]}, ext({
    query:(tableState)=>{
        // transform the table state into an http query, example:
        const query = yourSdk.queryfy(tableState);

        //send the request (return a promise), example:
        return yourSdk.get(query)
            .then(result =>{
                //parse the response and return the required object, example:
                return yourSdk.parse(result);
            });
    }
}));


//then regular smart-table usage
st.sort({pointer:'foo'});
// > send http request and update the system with the response
```