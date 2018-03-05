/**
 * Mock stub methods and functions
 *
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var stub = module.exports = {
    stub: stub,
    spy: spy,
    stubOnce: stubOnce,
    spyOnce: spyOnce,
};


// convert functions into object/method normal form
function normalizeArgs( object, methodName, overrideMethod ) {
    // backward compat: allow an obsolete `options` last parameter
    if (_typeof(overrideMethod) === 'object' && arguments[3] === undefined) overrideMethod = undefined;

    if (object != null && _typeof(methodName) === 'string') {
        // named method on anything that might have a property
        return { ob: object, me: methodName, ov: overrideMethod };
    }
    if (object == null && _typeof(methodName) === 'function') {
        // backward compat: spy(null, func)
        return { ob: { fn: methodName }, me: 'fn', ov: overrideMethod };
    }
    if (object == null && methodName == null) {
        // no args
        return { ob: { fn: object }, me: 'fn', ov: null };
    }
    if (_typeof(object) === 'function' && _typeof(methodName) === 'function') {
        // function and override
        return { ob: { fn: object }, me: 'fn', ov: methodName };
    }
    if (_typeof(object) === 'function' && methodName == null && (overrideMethod == null || _typeof(overrideMethod) === 'function')) {
        // backward compat: function and optional archaic override
        return { ob: { fn: object }, me: 'fn', ov: overrideMethod };
    }
    if (object == null) throw new Error('null object to spy/stub');
    throw new Error('invalid arguments to spy/stub: ' + _typeof(object) + ',' + _typeof(methodName) + ',' + _typeof(overrideMethod));

    function _typeof(v) {
        var type = typeof v;
        return type === 'object' && !v ? 'null' : type;
    }
}

// spy on calls to the function or method, return the instrumented spy function
function spy( objectOrFunction, methodName, overrideMethod ) {
    // TODO: merge into stub()
    var args = normalizeArgs(objectOrFunction, methodName, overrideMethod);
    var object = args.ob, methodName = args.me, overrideMethod = args.ov;

    // if nothing given to spy on, spy on an anonymous stub instead
    var _spy = stub.stub(object, methodName, overrideMethod || object[methodName] || 'stub')
        .configure('saveLimit', 10);
    return _spy;
}

function Retval( err, ret, yields, once ) {
    this.isError = err != undefined;
    this.err = err;
    this.ret = ret;
    this.yields = yields;
    this.once = once;
}
var _callCounter = 0;
function stub( objectOrFunction, methodName, overrideMethod ) {
    var args = normalizeArgs(objectOrFunction, methodName, overrideMethod);
    var object = args.ob, methodName = args.me, overrideMethod = args.ov;

// TODO: if function is a constructor, should patch up spy.__proto__ and spy.constructor

    if (overrideMethod && typeof overrideMethod !== 'function' && overrideMethod !== 'stub') throw new Error("override not a function");
    if (overrideMethod == undefined) overrideMethod = 'stub';

    // TODO: make context an instance, eg new Stub(object, methodName, overrideMethod);
    // actually, could return the stub function itself
    var context = {
        _type: 'qmockStub',
        callCount: 0,
        callArguments: null,
        callReturn: null,
        callResult: null,
        callError: null,
        callCallbackArguments: null,
        callCallbackError: null,
        error: null,

        // TODO: bind to vars in context, do not replicate
        _object: object,
        _method: object[methodName],
        _methodName: methodName,
        _hadNamedMethod: object.hasOwnProperty(methodName),
        _overrideMethod: overrideMethod,
        // the last retvals is permanent, others in front are once-time-only
        _retvals: new Array(new Retval()),

        _restoreAfterCalls: Infinity,
        _saveLimit: 3,
        _callArguments: [],
        _callResults: [],
        _callErrors: [],
        _callCallbackArguments: [],
        _callCallbackErrors: [],

        called: false,
        args: 'set below',

        restore: function restore( ) {
            if (this._hadNamedMethod) return this._object[this._methodName] = this._method;
            else delete this._object[this._methodName];
        },

        configure: function configure( name, value ) {
            _spy['_' + name] = value;
            return _spy;
        },

        getAllArguments: function() { return this._callArguments },
        getAllResults: function() { return this._callResults },
        getAllErrors: function() { return this._callErrors },
        getAllCallbackArguments: function() { return this._callCallbackArguments },
    };

    // intercept calls to the stub to track statistics
    var _spy = object[methodName] = function _spy() {
        var argv = new Array();
        for (var i=0; i<arguments.length; i++) argv[i] = arguments[i];

        return recordMethod(_spy, _spy._overrideMethod, this, argv);
    }
    for (var k in context) _spy[k] = context[k];
    // backward compat: make the context available as .stub
    _spy.stub = _spy;

    // minor sinon compatibility
    _spy.args = _spy._callArguments;
    _spy.returnValues = _spy._callResults;
    _spy.exceptions = _spy._callErrors;

    _spy.yields = function _yields( /* VARARGS */ ) {
        // TODO: callsArgWith() to call back to other than first callback arg, with args
        // TODO: yieldsTo(method, ...args) calls the property of the (first) matching argument
        // TODO: yieldsAsync() calls back after a small pause and in a new event loop
        var args = new Array();
        for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
        this._overrideMethod = 'stub';
        this._retvals[this._retvals.length - 1].yields = args;
        return this;
    }
    _spy.returns = function _returns( val ) {
        // TODO: returns(val), returnsArg(n), returnsThis()
        this._overrideMethod = 'stub';
        this._retvals[this._retvals.length - 1].ret = val;
        return this;
    }
    _spy.throws = function _throws( err ) {
        // TODO: (), ("TypeName"), (obj)
        this._overrideMethod = 'stub';
        this._retvals[this._retvals.length - 1].isError = true;
        this._retvals[this._retvals.length - 1].err = err;
        return this;
    }
    _spy._mockOnce = function __mockOnce( err, ret, yields ) {
        // TODO: maybe fold this method into `configure`
        if (yields != null && !Array.isArray(yields)) throw new Error("_mockOnce: yields expects an array");
        this._overrideMethod = 'stub';
        var retval = this._retvals.pop();
        var onceval = new Retval(err, ret, yields, true);
        this._retvals.push(onceval);
        this._retvals.push(retval);
        return this;
    }
    _spy.yieldsOnce = function _yieldsOnce( /* VARARGS */ ) {
        var args = new Array();
        for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
        return this._mockOnce(undefined, undefined, args);
    }
    _spy.returnsOnce = function _returnsOnce( val ) {
        return this._mockOnce(null, val);
    }
    _spy.throwsOnce = function _throwsOnce( err ) {
        return this._mockOnce(err);
    }
    // ??? _spy.callsBack = _spy.yields;
    _spy.getCall = function _getCall( n ) {
        return {
            proxy: {},
            this: objectOrFunction === object ? object : undefined,
            args: _spy._callArguments[n],
            returnValue: _spy._callResults[n],
            exception: _spy._callErrors[n],
            stack: undefined
        }
    }

    return _spy;
}

function spyOnce( objectOrFunction, methodName, overrideMethod ) {
    var _spy = stub.spy(objectOrFunction, methodName, overrideMethod)
        .configure('saveLimit', 10)
        .configure('restoreAfterCalls', 1);
    return _spy;
}

function stubOnce( objectOrFunction, methodName, overrideMethod ) {
    var _spy = stub.stub(objectOrFunction, methodName, overrideMethod)
        .configure('saveLimit', 3)
        .configure('restoreAfterCalls', 1);
    return _spy;
}

/*
 * record stats about the call to the stubbed/spied method
 */
function recordMethod( stub, interceptedMethod, interceptedThisObject, args ) {
    stub.callCount += 1;
    stub.called = true;
    stub.callArguments = args.slice();

    var isSaveInfo = stub._callResults.length < stub._saveLimit;
    if (isSaveInfo) stub._callArguments.push(stub.callArguments);

    // assume the first function is the callback
    var cb, cbix;
    for (var i=0; i<args.length; i++) if (typeof args[i] === 'function') { cb = args[i]; cbix = i; break; }

    // also intercept callbacks the spied-on function might make
    if (interceptedMethod !== 'stub') {
        if (cb) {
            // record stats about the stubbed/spied function callback too
            // TODO: conceptually, this is almost identical to stubbing a method,
            //   should be some way of better factoring out the commonalities
            // TODO: need an option to turn off callback interception
            args[cbix] = function _spyCallback() {
                var argv = new Array();
                for (var i=0; i<arguments.length; i++) argv[i] = arguments[i];

                // TODO: tie callback to the call by call-id (or store into per-call struct)
                if (isSaveInfo) stub._callCallbackArguments.push(argv);
                stub.callCallbackArguments = argv;

                var ret = _tryApply(cb, null, argv);

                stub.callCallbackError = ret.err;
                // TODO: tag errors with the call id
                if (isSaveInfo) stub._callCallbackErrors.push(ret.err);
                if (ret.isError) throw ret.err;
                return ret.ret;
            }
        }
    }

    // restore before the callback so caller sees the unmodified object
    if (--stub._restoreAfterCalls <= 0) stub.restore();

    if (interceptedMethod === 'stub') {
        var ret = stub._retvals[0];
        if (ret.once) stub._retvals.shift();
        if (ret.yields) {
            if (ret.isError) setImmediate(function(){ cb.apply(null, ret.yields) });
            else cb.apply(null, ret.yields);
        }
    } else {
        var ret = _tryApply(interceptedMethod, interceptedThisObject, args);
    }

    // return value is only available after the call returns
    stub.callReturn = ret.ret;
    stub.callResult = ret.ret;
    stub.callError = ret.err;
    // TODO: distinguish thrown null / undefined from "no error"
    if (ret.isError) stub.error = ret.err;

    if (isSaveInfo) stub._callErrors.push(ret.err);
    if (isSaveInfo) stub._callResults.push(ret.ret);

    if (ret.isError) throw ret.err;
    else return ret.ret;
};

function _tryApply( func, self, args ) {
    try {
        return new Retval(null, func.apply(self, args));
    }
    catch (err) {
        return new Retval(err);
    }
}

function intercept( fname, handler ) {
    return function( /* VARARGS */ ) {
        var args = new Array();
        for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
        return handler.call(this, args);
    }
    //return new Function(x.replace(/^function /, 'function ' + fname));
}
