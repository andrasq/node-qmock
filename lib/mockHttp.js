/**
 * Mock require('http') requests
 *
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var Stream = require('stream');
var http = require('http');
var https = require('https');
var Url = require('url');
var util = require('util');

var originals = {
    httpRequest: http.request,
    httpsRequest: https.request,
};

module.exports = {
    mockHttp: function mockHttp( handler ) {
        http.request = mockRequest(handler);
        https.request = mockRequest(handler);
        // TODO: return a handler object, for easier behavior mocking
        // TODO: handler.match(/url/).match(function(req, res){ return req.headers['content-type'] == 'text/plllll
        // match:  regex => url, string => url, function(req, res) => compute
        // send: (body), (statusCode, body), (statusCode, body, headers), function(req, res) => compute
    },

    unmockHttp: function unmockHttp( ) {
        http.request = originals.httpRequest;
        https.request = originals.httpsRequest;
    },
}

/*
 * on every request(), invoke the handler with (req, res, done) and let the handler
 * manage the "session".  The handler is invoked immediately after req is returned to
 * the caller.  The caller`s reuest callback is invoked with res when
 * res.once('mockResponse') fires.
 */
function mockRequest( httpHandler ) {
    return function( uri, callback ) {
        var options = typeof uri === 'string' ? Url.parse(uri) : uri;
        var socket = new Stream();
        var options = util._extend({
            // from https.js:
            defaultPort: 443,
            createConnection: function(port, host, options) {
                return socket;
            }
        }, options);

        // mock up the socket, req, res
// FIXME: procol: 'https:' breaks new ClientRequest; how does nodejs https create it?
options.protocol = 'http:';
        var req = new http.ClientRequest(options, function(){});
        var res = new http.IncomingMessage(socket);

        req.once('mockResponse', function(handlerRes) {
            callback(handlerRes || res);
        })

        // request/response emulation is up to the httpHandler fake http server
        setImmediate(function(){
            httpHandler(req, res);
        })

        return req;
    }
}
