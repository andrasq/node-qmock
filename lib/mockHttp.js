/**
 * Mock require('http') requests
 *
 * Copyright (C) 2017-2021 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var stream = require('stream').Stream;
var http = require('http');
var https = require('https');
var Url = require('url');
var util = require('util');

var mockHttpServer;
var setImmediate = eval('global.setImmediate || process.nextTick');

// global lookup functions to return the actual http.request methods
// Sometimes this file can be re-loaded and the wrong (intercepted) http.request used.
eval("if (!global.___qmock_http_request) Object.defineProperty(global, '___qmock_http_request', { value: http.request, enumerable: false })");
eval("if (!global.___qmock_https_request) Object.defineProperty(global, '___qmock_https_request', { value: https.request, enumerable: false })");

// save the system http methods, and define pass-through intercepters
var originals = {
    httpRequest: http.request,
    httpsRequest: https.request,
    sysHttpRequest: global.___qmock_http_request,
    sysHttpsRequest: global.___qmock_https_request,
    interceptedHttpRequest: function() { ensureProtocol(arguments[0], 'http:'); return originals.httpRequest.apply(http, arguments) },
    interceptedHttpsRequest: function() { ensureProtocol(arguments[0], 'https:'); return originals.httpsRequest.apply(https, arguments) },
};
function ensureProtocol( args, protocol ) {
    // FIXME: makeRequest workaround: patch up the protocol if needed, but the uri should already have it.
    if (args && typeof args === 'object' && !args.protocol) args.protocol = protocol;
}

// fromBuf adapted from qibl
var fromBuf = eval('parseInt(process.versions.node) >= 6 ? Buffer.from : Buffer');

module.exports = {
    mockHttp: function mockHttp( handler ) {
        var server;
        if (!handler) {
            server = mockHttpServer.create();
            handler = server.makeHandler();
        }
        originals.httpRequest = mockRequest(handler, { defaultPort: 80 });
        originals.httpsRequest = mockRequest(handler, { defaultPort: 443 });
        module.exports.install();

        return server;
    },

    unmockHttp: function unmockHttp( ) {
        originals.httpRequest = originals.sysHttpRequest;
        originals.httpsRequest = originals.sysHttpsRequest;
        module.exports.uninstall();
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
// NOTE: do not auto-install, that would not guarantee mockability -- it would only work
// if qmock were loaded before the http user, which is not guaranteed.  Better if it must
// be installed explicitly.
// module.exports.install();

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

        // support req.abort()
        req._mockWrites = new Array();
        req.abort = function() {
            req.__destroyed = true;
            req._mockWrites.splice(0);
            setImmediate(function() { req.emit('abort'); req.emit('error', makeError('ECONNRESET', 'Error: socket hang up')); req.emit('close'); });
        }

        // callback is optional, but http seems to always pass one in
        // if (!callback) callback = _noop;
        // node-v0.8 does not have stream.Writable... but seems ok with just Stream?
        req.socket = new (stream.Writable || stream.Stream)();
        req.socket.setTimeout = _noop;
        req.socket.destroy = req.abort; // mock only, do not actually destroy sockets

        // preserve the request options, we might need them later
        req._options = options;

        // provide a callable ClientRequest / IncomingMessage setTimeout method
        // simulate timeouts with .delay + .throw / .emit('error', new Error('ETIMEDOUT'))

        // req.socket will be set on nextTick to a Stream, change it back to our mock socket
        var reqSocket = req.socket;
        process.nextTick(function() { req.socket = reqSocket });

        // init the standard fields
        // node-v12 and up deprecate accessing OutgoingMessage._headers, writable/enumerable/configurable all false
        // However, http.ClientRequest() pre-initializes it with 'host' and maybe 'content-length'
        // Object.defineProperty avoids the deprecation warning, but breaks setHeader: headers dont get set
        if (parseInt(process.versions.node) < 12) req._headers = {};
        res.headers = {};
        // NOTE: in node-v8 can no longer set or delete in req._headers[], must use req.setHeader()
        for (var k in uri.headers) req.setHeader(k.toLowerCase(), uri.headers[k]);
        if (uri.auth) req.setHeader('authorization', 'Basic ' + fromBuf(uri.auth).toString('base64'));

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

        // start the mock implementation when the request is made, it should gather the writes and act on .end()
        // actual response emulation is up to the httpHandler fake server, eg mockHttpServer
        setImmediate(function() {
            // req.url is set inside the response callback, but not in caller request object
            // We cheat and use the same req object for both contexts.
            req.url = options.path || options.pathname + (options.query || '') + (options.hash || '');
            req.method = options.method || 'GET';
            httpHandler(req, res);
        })

        // TODO: mock more http.ServerResponse response methods, for familiarity
        // write, end, addTrailers, getHeader, setHeader, headersSent, statusCode, statusMessage, writeHead,
        // Set headers, statusCode, statusMessage

        // capture the request payload so we can restart it if necessary
        req.write = function(data, encoding) {
            if (req.__destroyed) return;
            req._mockWrites.push([data, encoding]);
            req.emit('_mockWrite', data, encoding);
        }
        req.end = function(data, encoding) {
            if (req.__destroyed) return;
            if (data) req.write(data, encoding);
            req._mockWrites.push(null);
            req.emit('_mockWrite', null);
        }

        return req;
    }
}

/*
 * construct a url that will behave like request(options) would
 * See also mockHttpServer.buildUrl
 */
/**
function composeUrl( options ) {
    var urlOptions = {};
    for (var k in options) urlOptions[k] = options[k];
    var path = options.path, pathname = options.pathname;

    // req.url should contain the query string, in path but not in pathname
    delete urlOptions.path;
    delete urlOptions.pathname;

    // auth must be string, else str.charCodeAt in Url.format will throw
    // if (typeof urlOptions.auth !== 'string') delete urlOptions.auth;

    // http.request() uses host|hostname+port, path.  url.format() uses host|hostname+port, pathname.
    // Note that url.format url-encodes the query string contained in the path.

// FIXME: composeUrl should build a full url: protocol: // host / path
// Note that req.url should be just the path, not hostname
    var url = Url.format(urlOptions);
    //url = (options.prototocol || 'http:') + (options.slashes === false ? '' : '//') + url;

    url += (path || pathname);
    return url;
}
**/

// makeError adapted from qibl 1.5.0-pre
function makeError( code, message, baseFunc ) {
    var err = (err = new Error(message), Error.captureStackTrace(err, baseFunc), err);
    return (err.code = code, err);
}
