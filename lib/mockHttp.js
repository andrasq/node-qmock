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

var mockHttpServer = require('./mockHttpServer');

var originals = {
    httpRequest: http.request,
    httpsRequest: https.request,
};

module.exports = {
    mockHttp: function mockHttp( handler ) {
        var server;
        if (!handler) {
            server = mockHttpServer.create();
            handler = server.makeHandler();
        }
        http.request = mockRequest(handler, { defaultPort: 80 });
        https.request = mockRequest(handler, { defaultPort: 443 });

        return server;
    },

    unmockHttp: function unmockHttp( ) {
        http.request = originals.httpRequest;
        https.request = originals.httpsRequest;
    },

    _getOriginals: function( ) {
        return originals;
    },
}

/*
 * on every request(), invoke the handler with (req, res, done) and let the handler
 * manage the "session".  The handler is invoked immediately after req is returned to
 * the caller.  The caller`s request callback is invoked with res when
 * res.once('mockResponse') fires.
 * Note: the handler gets client-side objects ClientRequest and IncomingMessage objects,
 * not the server-side IncomingMessage and ServerResponse.
 */
function mockRequest( httpHandler, defaultOptions ) {
    return function _mockRequestCall( uri, callback ) {
        var options = typeof uri === 'string' ? Url.parse(uri) : uri;
        var socket = new Stream();
        var options = util._extend(util._extend({
            createConnection: function(port, host, options) {
                return socket;
            }
        }, defaultOptions), options);

        // mock up the socket, req, res
// FIXME: procol: 'https:' breaks new ClientRequest; how does nodejs https create it?
options.protocol = 'http:';
        var req = new http.ClientRequest(options, function(){});
        var res = new http.IncomingMessage(socket);

        if (!callback) {
            req.emit('error', new Error("missing url"));
            return req;
        }

        // preserve the request options, we might need them later
        req._options = options;

        req.once('mockResponse', function(handlerRes) {
            callback(handlerRes || res);
        })

        // request/response emulation is up to the httpHandler fake http server
        setImmediate(function(){
            httpHandler(req, res);
        })

        // TODO: mock more http.ServerResponse response methods, for familiarity
        // write, end, addTrailers, getHeader, setHeader, headersSent, statusCode, statusMessage, writeHead,
        // Set headers, statusCode, statusMessage

        // capture the request payload so we can restart it if necessary
        req._mockWrites = new Array();
        req.write = function(data, encoding) {
            req._mockWrites.push([data, encoding]);
            req.emit('_mockWrite', data, encoding);
        }
        req.end = function(data, encoding) {
            if (data) req.write(data, encoding);
            req._mockWrites.push(null);
            req.emit('_mockWrite', null);
        }

        return req;
    }
}
