/**
 * Mock stub methods and functions
 *
 * Copyright (C) 2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

module.exports = stub;


function _tryApply( func, self, args ) {
    try {
        return { ret: func.apply(self, args), err: null };
    }
    catch (err) {
        return { ret: undefined, err: err };
    }
}

function stub( object, methodName, functionBody, options ) {
    if (!functionBody) functionBody = object[methodName];

    var stub = {
        callCount: 0,
        callArguments: null,
        callReturn: null,
        callError: null,

        _stub: functionBody,
        _object: object,
        _stubbedName: methodName,
        _hadStubbedProperty: object.hasOwnProperty(methodName),
        _stubbed: object[methodName],

        _saveLimit: options && options.saveLimit ? options.saveLimit : 0,
        _callArguments: [],
        _callReturns: [],
        _callErrors: [],

        restore: function restore( ) {
            if (this._hadStubbedProperty) this._object[this._stubbedName] = this._stubbed;
            else delete this._object[this._stubbedName];
        },
    };

    object[methodName] = function( ) {
        stub.callCount += 1;

        var args = new Array();
        for (var i=0; i<arguments.length; i++) args[i] = arguments[i];

        var isSaveInfo = stub._callReturns.length < stub._saveLimit;
        if (isSaveInfo) stub._callArguments.push(args);

        stub.callArguments = args;
        var ret = _tryApply(stub._stub, stub._object, args);
        // TODO: handle callbacked functions any different?  ie shouldReturn() vs shouldCallbackWith() expectation
        stub.callReturn = ret.ret;
        stub.callError = ret.err;

        if (isSaveInfo) stub._callErrors.push(ret.err);
        if (isSaveInfo) stub._callReturns.push(ret.ret);

        if (ret.err) throw ret.err;
        else return ret.ret;
    };

    return stub;
}
