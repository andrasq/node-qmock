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
};


function spy( object, methodName ) {
    return stub(object, methodName, null, { saveLimit: 10 });
}

function stub( object, methodName, overrideMethod, options ) {
    if (overrideMethod == undefined) overrideMethod = object[methodName];

    var stub = {
        _type: 'qmockStub',
        callCount: 0,
        callArguments: null,
        callReturn: null,
        callError: null,
        callCallbackArguments: null,
        callCallbackError: null,
        error: null,

        _object: object,
        _method: object[methodName],
        _methodName: methodName,
        _hadNamedMethod: object.hasOwnProperty(methodName),
        _overrideMethod: overrideMethod,

        _saveLimit: options && options.saveLimit ? options.saveLimit : 0,
        _callArguments: [],
        _callReturns: [],
        _callErrors: [],

        restore: function restore( ) {
            if (this._hadNamedMethod) this._object[this._methodName] = this._method;
            else delete this._object[this._methodName];
        },

        getAllArguments: function() { return this._callArguments },
        getAllResults: function() { return this._callReturns },
        getAllErrors: function() { return this._callErrors },
    };

    // intercept calls to the stub to track statistics
    object[methodName] = interceptCall(stub._overrideMethod, stub._object, function( interceptedMethod, interceptedObject, args ) {
        stub.callCount += 1;

        // also intercept callbacks the spied-on function might make
        var lastArg = args.length - 1;
        if (typeof args[lastArg] === 'function') {
            args[lastArg] = interceptCall(args[lastArg], null, function(cbCall, cbObj, cbArgs) {
                stub.callCallbackArguments = cbArgs;
                var ret = _tryApply(cbCall, cbObj, cbArgs);
                stub.callCallbackError = ret.err;
                if (ret.isError) throw ret.err;
                return ret.ret;
            });
        }

        var isSaveInfo = stub._callReturns.length < stub._saveLimit;
        if (isSaveInfo) stub._callArguments.push(args);

        stub.callArguments = args;
        var ret = _tryApply(interceptedMethod, interceptedObject, args);
        stub.callReturn = ret.ret;
        stub.callError = ret.err;
        // TODO: distinguish null and undefined exceptions from "no error"
        if (ret.isError) stub.error = ret.err;

        if (isSaveInfo) stub._callErrors.push(ret.err);
        if (isSaveInfo) stub._callReturns.push(ret.ret);

        if (ret.err) throw ret.err;
        else return ret.ret;
    });

    function interceptCall( method, object, handler ) {
        return function callIntercepter( ) {
            var args = new Array();
            for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
            handler(method, object, args);
        }
    }

    return stub;
}

function _tryApply( func, self, args ) {
    try {
        return { ret: func.apply(self, args), err: null, isError: false };
    }
    catch (err) {
        return { ret: undefined, err: err, isError: true };
    }
}
