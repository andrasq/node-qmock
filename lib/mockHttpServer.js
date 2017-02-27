/**
 * Mock http.request with higher-level response syntax
 *
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var util = require('util');
var mockHttp = require('./mockHttp');

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

// class methods
MockServer.buildUrl = function buildUrl( options, pathname ) {
    var protocol = options.protocol ? options.protocol : 'http:';
    var hostport = options.hostname + (options.port ? ':' + options.port : '');
    var url = protocol + '//' + hostport + pathname;
    return url;
}

MockServer.prototype.handler = function handler( ) {
    var self = this;

    return function _mockServerRequestHandler( req, res ) {
        // wait for req.end() before acting on the request
        if (req._mockWrites[req._mockWrites.length - 1] === null) {
            launchRequest();
        } else {
            req.on('_mockWrite', function(data) {
                if (data === null) launchRequest();
            })
        }

        function launchRequest( ) {
            var actions = findActions(self.conditions, req, res);

            if (!actions) {
                req.emit('error', new Error("no mock defined for " + MockServer.buildUrl(req._options, req._options.pathname)));
                return;
                // TODO: make a real request if no predefined mock for url
                // if no actions defined for this url, make the request using real http
                // For now, can unmockHttp(), make the real http call, and mockHttp again.
                // if (req._options.allowRealHttp) actions.push(makeRealHttpRequest);
            }

            var responseStarted = false;
            res.once('mockResponse', function(res2) {
                responseStarted = true;
                res = res2;
            })
            iterateActions(req, res, self.beforeActions, function(err) {
                if (err) throw err;
                // res callback is started right after `before` steps finish
                if (!responseStarted) req.emit('mockResponse');
                iterateActions(req, res, actions, function(err) {
                    if (err) throw err;
                    iterateActions(req, res, self.afterActions, function(err) {
                        if (err) throw err;
                    })
                })
            })
        }
    }

    // TODO: make these inner functions into methods, for testability
    function iterateActions( req, res, actions, next, _i ) {
        if (!_i) _i = 0;
        if (_i >= actions.length) return next();

        // TODO: make each call a method call on the shared context!
        // eg actions[_i].call(this.context, req, res, function(err) { ... })
        actions[_i](req, res, function(err) {
            if (err) return next(err);
            iterateActions(req, res, actions, next, ++_i);
        })
    }

    //
    // TODO: direct http request support not enabled yet
    //
    function makeRealHttpRequest( req, res, next ) {
        var originals = mockHttp._getOriginals();
        var request = req._options.protocol == 'https:' ? originals.httpsRequest : originals.httpRequest;
        var req2 = request(req._options, function(res2) {
            util._extend(req2._events, req._events);    // preserve the caller event listeners
            util._extend(req, req2);                    // clone the actual req into the caller req
            res.emit('mockResponse', res2);             // let the actions stack know the response started
        })
        // relay errors now so caller gets connect errors
        req2.on('error', function(err) {
            req.emit('error', err);
        })
        // resend the payload (or payload so far) to the real web server
        for (var i=0; i<req._mockWrites.length; i++) {
            if (req._mockWrites[i] === null) req2.end();
            else req2.write(req._mockWrites[i][0], req._mockWrites[i][1]);
        }
    }

    function findActions( conditions, req, res ) {
        for (var i=0; i<conditions.length; i++) {
            if (conditions[i].check(req, res)) return conditions[i].actions;
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
    if (typeof condition === 'function') {
        tester = condition;
    }
    else if (typeof condition === 'string') {
        var self = this;
        tester = function(req, res) {
            var url = MockServer.buildUrl(req._options, req._options.pathname);
            return req._options.pathname === condition || url === condition;
        };
    }
    else if (condition instanceof RegExp) {
        var self = this;
        tester = function(req, res) {
            var url = MockServer.buildUrl(req._options, req._options.pathname);
            return condition.test(req._options.pathname) || condition.test(url);
        };
    }
    /**
    // TODO: maybe later
    else if (typeof condition === 'object') {
        tester = function(req, res) {
            return _containsKeyValues(req, condition);
        }
    }
    **/

    // each `when` starts a new actions list.
    // All subsequent actions go on this list until the next `when`
    var actions = this.actions = new Array();
    if (tester) this.conditions.push({ check: tester, actions: actions });

    return this;

    function _containsKeyValues( req, condition ) {
        for (var k in condition) {
            if (condition[k] == req[k]) continue;
            if (_isHash(condition[k]) && _isHash(req[k]) && !_containsKeyValues(req[k], condition[i])) return false;
            return false;
        }
        return true;
    }

    function _isHash( obj ) {
        return typeof obj === 'object' && Object.prototype.toString.call(obj) === '[object Object]';
    }
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

/**
 * add an error action to the current actions list in effect
 */
MockServer.prototype.throw = function throw_( err ) {
    this.actions.push(function(req, res, next){
        throw err
    });
    return this;
}

/**
 * TODO: add a res.emit action to the current actions list in effect.
 */
/**
MockServer.prototype.emit = function emit( event ) {
    var args = new Array();
    for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
    this.actions.push(function(req, res, next) {
        res.emit.apply(res, args);
        next();
    })
    return this;
}
**/

/**
 * append data to the response
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
 * send final response.  Appends the data and flushes to the receiver.
 */
MockServer.prototype.send = function send( statusCode, body, headers ) {
// TODO: arrange for the headers (or standard headers) to be written to res.socket
// TODO: arrange for the body to be written to res.socket, so req can parse it

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
            if (!res._headers) res._headers = {};
            util._extend(res._headers, headers);
        }
        res.statusCode = statusCode;
        res.push(body);
        res.push(null);
        next();
    })
    return this;
}

MockServer.prototype = MockServer.prototype;
