/**
 * Mock stub methods and functions
 *
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

module.exports = {
    stub: stub,
    spy: spy,
    stubOnce: stubOnce,
    spyOnce: spyOnce,
};


function spy( objectOrFunction, methodName, overrideMethod, options ) {
    if (!options && typeof overrideMethod !== 'function') { options = overrideMethod; overrideMethod = undefined }
    var saveLimit = (options && options.saveLimit !== undefined) ? options.saveLimit : 10;

    if (typeof objectOrFunction === 'object' && typeof methodName === 'string') {
        // spy on calls to the named method, return a stub that tracks the calls
        var object = objectOrFunction;
        if (!overrideMethod) overrideMethod = objectOrFunction[methodName];
        return stub(object, methodName, overrideMethod, { saveLimit: saveLimit });
    }
    else {
        // spy on calls to func, return an instrumented spy function
        var func = objectOrFunction;
        if (func && typeof func !== 'function') throw new Error("not a function");

        // without a function, use an anonymous function
        if (!func) func = function anon(){};

        var spyStub = stub({}, 'anon', func, { saveLimit: saveLimit });
        var spyFunc = spyStub._object.anon;

        // returns a spy function with a `stub` property and an empty `restore()` method
        spyFunc.stub = spyStub;                 // spied stats
        spyFunc.restore = function(){ throw new Error("can only restore an object method, not a bare function") };
        return spyFunc;
    }
}

function stub( object, methodName, overrideMethod, options ) {
    if (typeof overrideMethod !== 'function' && options == undefined) { options = overrideMethod; overrideMethod = undefined; };
    if (!options || typeof options !== 'object') options = { saveLimit: 0, stubSelf: false };
    if (overrideMethod && typeof overrideMethod !== 'function') throw new Error("override not a function");
    if (overrideMethod == undefined) {
        overrideMethod = options.stubWithSelf ? object[methodName] : function(){};
    }

    var stub = {
        _type: 'qmockStub',
        callCount: 0,
        callArguments: null,
        callReturn: null,
        callResult: null,
        callError: null,
        callCallbackArguments: null,
        callCallbackError: null,
        error: null,

        _object: object,
        _method: object[methodName],
        _methodName: methodName,
        _hadNamedMethod: object.hasOwnProperty(methodName),
        _overrideMethod: overrideMethod,

        _saveLimit: options.saveLimit ? options.saveLimit : 0,
        _callArguments: [],
        _callResults: [],
        _callErrors: [],
        _callCallbackArguments: [],
        _callCallbackErrors: [],

        args: 'set below',

        restore: function restore( ) {
            if (this._hadNamedMethod) this._object[this._methodName] = this._method;
            else delete this._object[this._methodName];
        },

        getAllArguments: function() { return this._callArguments },
        getAllResults: function() { return this._callResults },
        getAllErrors: function() { return this._callErrors },
        getAllCallbackArguments: function() { return this._callCallbackArguments },
    };

    // intercept calls to the stub to track statistics
    // a null `this` context will make interceptCall use the attached-to object
    var thisContext = null;
    stub._object[methodName] = interceptCall(stub, stub._overrideMethod, thisContext, recordMethod);

    // minor sinon compatibility
    stub.args = stub._callArguments;
    // TODO: maybe results, errs too
    stub._object[methodName].restore = function() { stub.restore() };

    return stub;
}

/*
 * one-shot stub: stub the function, but restore after the first call
 */
function _stubOnce( func, object, methodName, overrideMethod, options ) {
    var info = (func === 'stub')
        ? stub(object, methodName, overrideMethod, options)
        : spy(object, methodName, overrideMethod, options);
    info._object[info._methodName] = interceptCall(info, info._overrideMethod, object, handler);
    return info;

    function handler( stub, method, self, args ) {
        try {
            var ret = recordMethod(stub, method, self, args);
            stub.restore();
            return ret;
        }
        catch (err) {
            stub.restore();
            throw err;
        }
    }
}

function spyOnce( objectOrFunction, methodName, overrideMethod, options ) {
    return _stubOnce('spy', objectOrFunction, methodName, overrideMethod, options);
}

function stubOnce( object, methodName, overrideMethod, options ) {
    return _stubOnce('stub', object, methodName, overrideMethod, options);
}

/*
 * record stats about the call to the stubbed/spied method
 */
function recordMethod( stub, interceptedMethod, interceptedObject, args ) {
    stub.callCount += 1;

    // also intercept callbacks the spied-on function might make
    var lastArg = args.length - 1;
    if (typeof args[lastArg] === 'function') {
        args[lastArg] = interceptCall(stub, args[lastArg], null, recordCallback);
    }

    var isSaveInfo = stub._callResults.length < stub._saveLimit;
    if (isSaveInfo) stub._callArguments.push(args);

    stub.callArguments = args;
    var ret = _tryApply(interceptedMethod, interceptedObject, args);
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

/*
 * record stats about the stubbed/spied function callback too
 * TODO: conceptually, this is almost identical to stubbing a method,
 * should be some way of better factoring out the commonalities
 */
function recordCallback( stub, cbCall, cbObj, cbArgs ) {
    var isSaveInfo = stub._callCallbackArguments.length < stub._saveLimit;
    if (isSaveInfo) stub._callCallbackArguments.push(cbArgs);

    stub.callCallbackArguments = cbArgs;
    var ret = _tryApply(cbCall, cbObj, cbArgs);
    stub.callCallbackError = ret.err;

    if (isSaveInfo) stub._callCallbackErrors.push(ret.err);

    if (ret.isError) throw ret.err;
    return ret.ret;
}

/*
 * interpose a function between the caller and the object.method
 * to gather up the call arguments and invoke a different call handler.
 * The call handler must at some point actually invoke the method.
 * Context will be meaningful to the handler, but not to us.
 */
// TODO: qinvoke.interceptCall is more efficient, use that
function interceptCall( context, method, object, handler ) {
    return function callIntercepter( ) {
        var args = new Array();
        for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
        // if not specified, use the `this` that the stub is attached to
        var self = object ? object : this;
        return handler(context, method, self, args);
    }
}

function _tryApply( func, self, args ) {
    try {
        return { ret: func.apply(self, args), err: null, isError: false };
    }
    catch (err) {
        return { ret: undefined, err: err, isError: true };
    }
}
