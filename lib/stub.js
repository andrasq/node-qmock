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

    var ret = _tryApply(interceptedMethod, interceptedObject, args);

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
        return { ret: func.apply(self, args), err: null, isError: false };
    }
    catch (err) {
        return { ret: undefined, err: err, isError: true };
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
