/**
 * Mock require('http') requests
 *
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var stream = require('stream').Stream;
var http = require('http');
var https = require('https');
var Url = require('url');
var util = require('util');

var mockHttpServer;

// save the system http methods, and define pass-through intercepters
var originals = {
    httpRequest: http.request,
    httpsRequest: https.request,
    sysHttpRequest: http.request,
    sysHttpsRequest: https.request,
    interceptedHttpRequest: function() { return originals.httpRequest.apply(http, arguments) },
    interceptedHttpsRequest: function() { return originals.httpsRequest.apply(https, arguments) },
};

module.exports = {
    mockHttp: function mockHttp( handler ) {
        var server;
        if (!handler) {
            server = mockHttpServer.create();
            handler = server.makeHandler();
        }
        originals.httpRequest = mockRequest(handler, { defaultPort: 80 });
        originals.httpsRequest = mockRequest(handler, { defaultPort: 443 });

        return server;
    },

    unmockHttp: function unmockHttp( ) {
        originals.httpRequest = originals.sysHttpRequest;
        originals.httpsRequest = originals.sysHttpsRequest;
    },

    install: function( ) {
        http.request = originals.interceptedHttpRequest;
        https.request = originals.interceptedHttpsRequest;
    },

    uninstall: function( ) {
        http.request = originals.sysHttpRequest;
        https.request = originals.sysHttpsRequest;
    },

    // for testing and for server.makeRequest
    _methods: originals,
}

// require mockHttpServer only after exports have been defined
mockHttpServer = require('./mockHttpServer');

// re-vector the http methods to our pass-through handlers,
// so any requests made by function (not method) can still be mocked
module.exports.install();

function _noop() {};

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
        // NOTE: Url.parse downcases the path! ie 'PathName' => 'pathname'
        var socket = new stream.Stream();
        var options = util._extend(util._extend({
            createConnection: function(port, host, options) {
                return socket;
            }
        }, defaultOptions), options);

        // mock up the socket, req, res
        // TODO: procol 'https:' breaks new ClientRequest; how does nodejs https create it?
        var protocol = options.protocol;
        options.protocol = 'http:';
        var req = new http.ClientRequest(options, _noop);
        var res = new http.IncomingMessage(socket);
        options.protocol = protocol;

        // callback is optional, but http seems to always pass one in
        // if (!callback) callback = _noop;

        // preserve the request options, we might need them later
        req._options = options;

        // provide a callable ClientRequest / IncomingMessage setTimeout method
        // simulate timeouts with .delay + .throw / .emit('error', new Error('ETIMEDOUT'))
        req.socket = new stream.Writable();
        req.socket.setTimeout = _noop;

        // init the standard fields
        req._headers = {};
        res.headers = {};
        // NOTE: in node-v8 can no longer set or delete in req._headers[], must use req.setHeader()
        for (var k in uri.headers) req.setHeader(k.toLowerCase(), uri.headers[k]);

        req.once('mockResponse', function(handlerRes) {
            if (!handlerRes) handlerRes = res;

            // set the expected res fields to appear like
            // statusCode, statusMessage get set
            //handlerRes.statusCode = 200;
            //handlerRes.statusMessage = 'OK';
            handlerRes.url = req.url;
            handlerRes.method = req.method;
            handlerRes.socket = socket;
            if (handlerRes.httpVersion === null) {
                handlerRes.httpVersionMajor = '1';
                handlerRes.httpVersionMinor = '1';
                handlerRes.httpVersion = '1.1';
            }
            // also: rawHeaders, rawTrailers, 
            // FIXME: res.statusCode should be known in the callback, but is
            // actually set by the mock actions and will only be available on 'mockResponseDone'

            if (!handlerRes.headers) handlerRes.headers = {};

            req.once('mockResponseDone', function() {
                // be sure to flush the data and force an 'end' event
                handlerRes.push(null);
            })

            callback(handlerRes);
        })

        // request/response emulation is up to the httpHandler fake http server
        setImmediate(function(){
            req.url = options.href ? options.href : composeUrl(options);
            req.method = options.method || 'GET';
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

function shallowCopy( obj, to ) {
    to = to || {};
    for (var k in obj) to[k] = obj[k];
    return to;
}

/*
 * construct a url that will behave like request(options) would
 */
function composeUrl( options ) {
    var urlOptions = shallowCopy(options);
    var path = options.path, pathname = options.pathname;

    // req.url should contain the query string, in path but not in pathname
    delete urlOptions.path;
    delete urlOptions.pathname;

    // auth is "user:pass", else ignore
    if (typeof urlOptions.auth !== 'string') delete urlOptions.auth;

    // http.request() uses host|hostname+port, path.  url.format() uses host|hostname+port, pathname.
    // Note that url.format url-encodes the query string contained in the path.

    var url = Url.format(urlOptions);

    url += (path || pathname);
    return url;
}
