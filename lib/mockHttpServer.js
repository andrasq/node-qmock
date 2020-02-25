/**
 * Mock http.request with higher-level response syntax
 *
 * Copyright (C) 2017-2019 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var util = require('util');
var Url = require('url');
var mockHttp = require('./mockHttp');

var setImmediate = global.setImmediate || process.nextTick;

module.exports = {
    create: function() {
        return new MockServer();
    },

    MockServer: MockServer,
};

function MockServer( ) {
    this.conditions = new Array();
    this.beforeActions = new Array();
    this.afterActions = new Array();
    // actions preceding the first `when` go before all
    this.actions = this.beforeActions;
}

// construct the url being from the uri.  This mimics the process nodejs uses to make the request,
// and produces a url that is both visually and functionally the same (equivalent) to what was requested.
// Note the possible discrepancy in trailing slashes: buildUrl() will always leave a slash after hostport/
MockServer.buildUrl = function buildUrl( options ) {
    // note: node 0.10 inserts the port into the parsed url options,
    // later node do not.  An inserted port breaks the string compare.
    // So if the original href is available, compare to that.
    if (options.href) return options.href;

    // the fields used to make a request are method, protocol, host/hostname, port, path (default "http:// localhost :80 /")
    // pathname, search, query, hash, auth, slashes are informational but do not build the url.
    // host is url.parsed into "hostname:port" but must be "hostname" only in a request.  If both are set, hostname has precedence.

    // NOTE: both "http://host" and "http://host/" parse path and pathname into "/", no way to distinguish.
    // TODO:  We return the trailing slash, comparisons must expect it!

    var protocol, hostname, port, pathname;
    protocol = options.protocol || 'http:';
    hostname = options.hostname || options.host || 'localhost';                 // name of server nodejs will send to
    pathname = (options.path || '').replace(/\/?\?.*$/, '') || '/';             // path on server that will be requested, without the query string, never empty
    var hostport = hostname + (options.port ? ':' + options.port : '');         // include port only if provided, since 'http://host:80/' != 'http://host/'

    var url = protocol + '//' + hostport + pathname;
    return url;
}

// parse the annotated url string into a uri object
MockServer.parseUrl = function parseUrl( url ) {
    var method, match;
    if (match = url.match(/^([^:/]*):http[s]:\/\//)) {
        method = match[1].toUpperCase();
        url = url.slice(method.length + 1);
    }
    var uri = Url.parse(url);
    if (method) uri.method = method;
    return uri;
}

MockServer.prototype.makeHandler = function makeHandler( ) {
    var self = this;

    return function _mockServerRequestHandler( req, res ) {
        // wait for req.end() before acting on the request
        // req.end terminates the _mockWrites array with a `null` sentinel
        if (req._mockWrites[req._mockWrites.length - 1] === null) {
            launchRequest(req, res);
        } else {
            req.on('_mockWrite', function(data) {
                if (data === null) {
                    launchRequest(req, res);
                }
            })
        }

        function launchRequest( req, res ) {
            var actions = findActions(self.conditions, req, res);

            if (!actions) {
                req.emit('error', new Error("no handler for mock route " + MockServer.buildUrl(req._options)));
                return;
                // TODO: make a real request if no predefined mock for url
                // if no actions defined for this url, make the request using real http
                // For now, can unmockHttp(), make the real http call, and mockHttp again.
                // if (req._options.allowRealHttp) actions.push(makeRealHttpRequest);
            }

            iterateActions(req, res, self.beforeActions, function(err) {
                if (err) return req.emit('error', err);
                // use 'mockResponse' to tell mockHttp to run the user callback
                // res callback is started right after `before` steps finish
                // req.emit('response', res);
                if (!actions._omitCallback) req.emit('mockResponse');  // processed only once

                iterateActions(req, res, actions, function(err) {
                    if (err) return req.emit('error', err);
                    iterateActions(req, res, self.afterActions, function(err) {
                        req.emit('mockResponseDone');
                        if (err) return req.emit('error', err);

                    })
                })
            })
        }
    }

    // TODO: make these inner functions into methods, for testability
    function iterateActions( req, res, actions, next, _i ) {
        if (!_i) _i = 0;
        if (_i >= actions.length) return setImmediate(next);

        // TODO: make each call a method call on the shared context!
        // eg actions[_i].call(this.context, req, res, function(err) { ... })
        actions[_i](req, res, function(err) {
            if (err) return next(err);
            iterateActions(req, res, actions, next, ++_i);
        })
    }

    function findActions( conditions, req, res ) {
        for (var i=0; i<conditions.length; i++) {
            if (conditions[i].usesLeft > 0 && conditions[i].check(req, res)) {
                conditions[i].usesLeft -= 1;
                return conditions[i].actions;
            }
        }
        return false;
    }
}

/**
 * perform the action before the url is matched.  Actions are callouts taking (req,
 * res, next).  If no action is specified, starts gathering actions into the
 * beforeActions list.
 */
MockServer.prototype.before = function before( action ) {
    if (action) this.beforeActions.push(action);
    else this.actions = this.beforeActions;
    return this;
}

/**
 * perform the action after url actions have been run.  If no action is specified,
 * start gathering actions into the afterActions list.
 */
MockServer.prototype.after = function after( action ) {
    if (action) this.afterActions.push(action);
    else this.actions = this.afterActions;
    return this;
}

/**
 * Match the url against the condition.  Actions specified
 * after a match() are performed only in case of a match.
 * Conditions:
 *      @string         match path or url
 *      @RegExp         match path or url
 *      @function       delegate matching to func (req, res, next)
 */
MockServer.prototype.when = function when( condition ) {
    var tester;
    if (typeof condition === 'string') {
        var self = this;
        tester = function(req, res) {
            var url = MockServer.buildUrl(req._options);
            // pathname starts at the slash following hostport
            var mark, pathname = url.slice(url.indexOf('/', url.indexOf('://') + 3));
            // To match on the query path not also the query string params, test against _options.pathname
            var method = req.method + ':';
            return url === condition || method + url === condition ||           // match protocol://host/path/name?query#tag (or POST:...)
                pathname === condition || method + pathname === condition ||    // match /path/name?query#tag (or POST:...)
                req._options.pathname === condition || method + req._options.pathname === condition;
        };
    }
    else if (condition instanceof RegExp) {
        var self = this;
        tester = function(req, res) {
            var url = MockServer.buildUrl(req._options);
            var method = req.method + ':';
            return condition.test(url) || condition.test(method + url);
        };
    }
    else if (typeof condition === 'function') {
        tester = condition;
    }
/**
// TODO: maybe later
    else if (typeof condition === 'object') {
        tester = function(req, res) {
            return _containsKeyValues(req, condition);
        }
    }
**/
    else {
        throw new Error("when-condition not recognized");
    }

    // each `when` starts a new actions list.
    // All subsequent actions go on this list until the next `when`
    var actions = this.actions = new Array();
    this.conditions.push({ check: tester, actions: actions, usesLeft: Infinity });

    return this;

/**
// TODO: maybe later
    function _containsKeyValues( req, condition ) {
        for (var k in condition) {
            if (condition[k] == req[k]) continue;
            if (_isHash(condition[k]) && _isHash(req[k]) && !_containsKeyValues(req[k], condition[i])) return false;
            return false;
        }
        return true;
    }

    function _isHash( obj ) {
        return obj && typeof obj === 'object' && obj.constructor === 'Object';
    }
**/
}
MockServer.prototype.on = function on( condition ) {
    return this.when(condition);
}
MockServer.prototype.once = function once( condition ) {
    this.when(condition);
    this.conditions[this.conditions.length - 1].usesLeft = 1;
    return this;
}
// nickname for a route that always matches
MockServer.prototype.default = function default_( ) {
    return this.when(function(){ return true });
}

/**
 * add a compute action to the current actions list in effect
 */
MockServer.prototype.compute = function compute( callout ) {
    this.actions.push(callout);
    return this;
}

/**
 * add a delay action to the current actions list in effect
 */
MockServer.prototype.delay = function delay( ms ) {
    this.actions.push(function(req, res, next) {
        setTimeout(next, ms)
    })
    return this;
}
//MockServer.prototype.pause = MockServer.prototype.delay;

/**
 * add a request error to the current actions list in effect
 * The error is emitted on the req object.
 */
MockServer.prototype.throw = function throw_( err ) {
    this.actions.push(function(req, res, next){
        req.emit('error', err);
    });
    return this;
}

/**
 * arrange to emit a res event
 */
MockServer.prototype.emit = function emit( event ) {
    var args = new Array();
    for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
    this.actions.push(function(req, res, next) {
        res.emit.apply(res, args);
        next();
    })
    return this;
}

/**
 * append data to the response
// FIXME: write, writeHead and end should also wrapper res, to make it more seamless
// when used inside of compute()
 */
MockServer.prototype.write = function write( chunk, encoding, cb ) {
    if (typeof chunk === 'string' && typeof encoding === 'string') chunk = new Buffer(chunk, encoding);
    this.actions.push(function(req, res, next) {
        res.push(chunk);
        if (cb) cb();
        next();
    })
    return this;
}

/**
 * set statusCode and/or headers on the response
 */
MockServer.prototype.writeHead = function writeHead( statusCode, headers ) {
    if (!headers) {
        if (typeof statusCode === 'object') { headers = statusCode; statusCode = undefined; }
    }

    // set the headers to the values passed in to this function,
    // not to the runtime contents of the headers object
    if (headers) headers = util._extend({}, headers);

    this.actions.push(function(req, res, next) {
        if (statusCode !== undefined) res.statusCode = statusCode;
        if (headers) {
            util._extend(res.headers, headers);
        }
        next();
    })
    return this;
}

/**
 * optionally set the statusCode and maybe send a body, and finish the response
 */
MockServer.prototype.end = function end( statusCode, body ) {
    this.actions.push(function(req, res, next) {
        if (typeof statusCode === 'number') {
            res.statusCode = statusCode;
        } else {
            body = statusCode;
        }
        if (body !== undefined) res.push(body);
        res.push(null);
        next();
    })
    return this;
}

/**
 * send final response.  Appends the data and flushes to the receiver.
 */
MockServer.prototype.send = function send( statusCode, body, headers ) {
// TODO: arrange for the headers (or standard headers) to be written to res.socket
// TODO: arrange for the body to be written to res.socket, so res can parse it

    // accept a function(req, res, next) for computed responses
    if (arguments.length === 1 && typeof statusCode === 'function') {
        this.actions.push(arguments[0]);
        return this;
    }

    // accept any of:  status, body, status + body
    if (arguments.length < 2) {
        if (typeof statusCode === 'number') {
            body = "";
        } else {
            body = statusCode;
            statusCode = 200;
        }
    }

    if (headers) headers = util._extend({}, headers);
    this.actions.push(function(req, res, next) {
        if (headers) {
            util._extend(res.headers, headers);
        }
        res.statusCode = statusCode;
        res.push(body);
        res.push(null);
        next();
    })
    return this;
}

/**
 * make a real http request and pass through the response to the mock
 */
MockServer.prototype.makeRequest = function makeRequest( userUri, body, headers ) {
    if (typeof userUri === 'string') userUri = MockServer.parseUrl(userUri);

    this.actions.push(function _makeRequest(req, res, next) {
        var uri = userUri || Url.parse(MockServer.buildUrl(req._options));
        var isHttps = (uri.protocol === 'https:' || uri.protocol == undefined && uri.port == 443);

        uri.method = uri.method || req.method;
        if (!uri.method) return next(new Error('makeRequest: cannot request(), req.method was deleted'));
        if (!uri.protocol) uri.protocol = isHttps ? 'https:' : 'http:';

        var realRequest = isHttps ? mockHttp._methods.sysHttpsRequest : mockHttp._methods.sysHttpRequest;

        var realReq = realRequest(uri, function(realRes) {
            res.httpVersionMajor = realRes.httpVersionMajor;
            res.httpVersionMinor = realRes.httpVersionMinor;
            res.httpVersion = realRes.httpVersion;
            res.complete = realRes.complete;
            res.headers = realRes.headers;
            res.rawHeaders = realRes.rawHeaders;
            res.trailers = realRes.trailers;
            res.rawTrailers = realRes.rawTrailers;
            res.url = realRes.url;
            res.method = realRes.method;
            res.statusCode = realRes.statusCode;
            res.statusMessage = realRes.statusMessage;

            // once realRes has been mirrored into mock res, ok to run the user callback
            req.emit('mockResponse');

            realRes.on('data', function(chunk) { res.emit('data', chunk) })
            realRes.on('end', function() { res.emit('end') })
            // does res ever emit errors?
            // realRes.on('error', function(err) { res.emit('error', err) })
        })
        realReq.on('error', function(err) {
            req.emit('error', err)
        })

        // With a body and/or header the specified body and headers will be used.
        // Without a body the mock request will be replayed against the live url.
        if (body) {
            realReq.setHeader('Content-Length', Buffer.byteLength(body));
            for (var k in headers) realReq.setHeader(k, headers[k]);
            req.write(body);
            realReq.write(body);
            realReq.end();
        }
        else {
            // req captured the mock writes as an array of [ data, encoding ]
            // note: the caller must set content-length or set transfer-encoding: chunked, else ECONNRESET
            for (var k in req._headers) realReq.setHeader(k, req._headers[k]);
            for (var i=0; i<req._mockWrites.length; i++) {
                if (req._mockWrites[i]) realReq.write.apply(realReq, req._mockWrites[i]);
                else realReq.end();
            }
        }

        // note: could re-vector write() and end() to relay from the
        // mock req to the realReq, but not necessary, since launchRequest
        // only starts running (and calls to here) after req.end() was seen.
    })

    // this action needs needs the callback to be made only after the real request completes
    this.actions._omitCallback = true;

    return this;
}

/**
TODO: maybe allow mocked res.send() to automatically stringify objects.
Note that this breaks the barebonds-and-intuitive approach to http mocks.
function makeResChunk(chunk) {
    if (typeof chunk === 'string' || Buffer.isBuffer(chunk)) return chunk;
    try { return JSON.stringify(chunk) } catch (err) { return '"[unserializable object]"' }
}
**/

MockServer.prototype = MockServer.prototype;
