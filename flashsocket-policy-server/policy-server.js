/**
 Handling flash policy requests
 */

var config = require('./config.json');

var file = 'flashpolicy.xml',
    port = config.port,
    policyContent;

require("console-stamp")(console, {
  label: true,
  colors: {
    stamp:    "yellow",
    label:    "white",
    metadata: "green"
  }
});

var fsps = require('net').createServer(function (stream) {
  stream.setEncoding('utf8');
  stream.setTimeout(3000); // 3s
  stream.on("error", function(err) {
    console.log("Caught flash policy server socket error: ");
    console.error(err.stack);
  });
  stream.on('connect', function () {
    console.log('Got connection from ' + stream.remoteAddress + '.');
  });
  stream.on('data', function (data) {
    if (data == '<policy-file-request/>\0') {
      //console.log('Good request. Sending file to ' + stream.remoteAddress + '.');
      try {
        stream.end(policyContent + '\0');
      }catch(e) {
        console.error('Error: ', e.stack)
      }
    } else {
      console.log('Bad request from ' + stream.remoteAddress + '.');
      try {
        stream.end();
      }catch(e) {
        console.error('Error: ', e.stack)
      }
    }
  });
  stream.on('end', function () {
    try {
      stream.end();
    }catch(e) {
      console.error('Error: ', e.stack)
    }
  });
  stream.on('timeout', function () {
    console.log('Request from ' + stream.remoteAddress + ' timed out.');
    try {
      stream.end();
    }catch(e) {
      console.error('Error: ', e.stack)
    }
  });
});

require('fs').readFile(file, 'utf8', function (err, data) {
  if (err) throw err;
  policyContent = data;
  fsps.listen(port);
  console.log('Flash socket policy server running at ' + port + ' port and serving ' + file);
});
