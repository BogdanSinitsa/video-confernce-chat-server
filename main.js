"use strict";

require("console-stamp")(console, {
    label: true,
    colors: {
        stamp:    "yellow",
        label:    "white",
        metadata: "green"
    },
    metadata:'[' + process.pid + ']'
});

var Main = require('./app/Main');

new Main().start();
