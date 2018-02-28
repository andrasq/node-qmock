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


// spy on calls to the function or method, return the instrumented spy function
function spy( objectOrFunction, methodName, overrideMethod, options ) {
    // TODO: remove options, edit the object instead
    if (!options && typeof overrideMethod !== 'function') { options = overrideMethod; overrideMethod = undefined }
    var saveLimit = (options && options.saveLimit !== undefined) ? options.saveLimit : 10;

    if (typeof objectOrFunction === 'object' && typeof methodName === 'string') {
// FIXME: if objectOrFunction is a constructor function, should mock as a class, not as a function!!
        var object = objectOrFunction;
        // spy() always "overrides with" (calls) self if at all possible
        if (!overrideMethod) overrideMethod = objectOrFunction[methodName];
        return stub(object, methodName, overrideMethod, { saveLimit: saveLimit });
    }
    else {
        var func = objectOrFunction;
        if (func && typeof func !== 'function') throw new Error("not a function");

        // without a function, spy on an anonymous function
        // This usage is semantically equivalent to calling stub().
        if (!func) func = function anonSpy(){};

        var spyFunc = stub({ fn: objectOrFunction }, 'fn', func, { saveLimit: saveLimit });

        // for backward compatibility, make the stats available on a property `stub`
        spyFunc.stub = spyFunc;

        return spyFunc;
    }
}

function stub( object, methodName, overrideMethod, options ) {
    // TODO: remove options, edit the object instead

    // TODO: clean up the interface: define the allowed call signatures, reject the rest
    // Note that only documented api is (object, methodName, [overrideMethod])
    // (), (func), (obj, name), (obj, name, repl) -- ditch the others
    // if (!object) return spy({ fn: undefined }, 'fn', function anonStub(){});
    // if (typeof object === 'function') return spy({ fn: object }, 'fn', function anonStub(){});

    // without arguments create an anonymous stub
    if (!object) return (typeof methodName === 'function')
        ? spy(methodName, null, null, { saveLimit: 3 })
        : spy(null, null, null, { saveLimit: 3 });

    if (typeof overrideMethod !== 'function' && options == undefined) { options = overrideMethod; overrideMethod = undefined; };
    if (!options || typeof options !== 'object') options = { saveLimit: 3, stubWithSelf: false };

    // convert bare functions to methods on a temp object
    if (typeof methodName === 'function') { overrideMethod = methodName; methodName = undefined }
    if (typeof object === 'function' && !methodName) return stub({ fn: object }, 'fn', overrideMethod, { saveLimit: 3 });

    // TODO: stub() should always override, either with overrideMethod or an anon func
    if (overrideMethod && typeof overrideMethod !== 'function') throw new Error("override not a function");
    if (overrideMethod == undefined) {
        overrideMethod = options.stubWithSelf ? object[methodName] : function anonStub(){};
    }

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

        _restoreAfterCalls: options.restoreAfterCalls || Infinity,
        _saveLimit: options.saveLimit >= 0 ? options.saveLimit : 3,
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

        getAllArguments: function() { return this._callArguments },
        getAllResults: function() { return this._callResults },
        getAllErrors: function() { return this._callErrors },
        getAllCallbackArguments: function() { return this._callCallbackArguments },
    };

    // minor sinon compatibility
    context.args = context._callArguments;
    // TODO: maybe results, errs too

    // intercept calls to the stub to track statistics
    // a null `this` context will make interceptCall use the attached-to object
    var thisContext = null;
    object[methodName] = interceptCall(stub, overrideMethod, thisContext, recordMethod);

    function _spy() {
        var argv = new Array();
        for (var i=0; i<arguments.length; i++) argv.push(arguments[i]);

        return recordMethod(_spy, context._overrideMethod, this, argv);
    }
    for (var k in context) _spy[k] = context[k];
    object[methodName] = _spy;

    // backward compat: make the context available as .stub
    _spy.stub = context;

    return _spy;
}

/*
 * one-shot stub: stub the function, but restore after the first call
 */
function _stubOnce( type, object, methodName, overrideMethod, options ) {
    // TODO: use spy._restoreAfterCalls

    var info = (type === 'stub')
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
// TODO:
//    var spy = stub(objectOrFunction, methodName, overrideMethod);
//    stub._saveLimit = 10;
//    spy._restoreAfterCalls = 1;
//    return spy;
}

function stubOnce( objectOrFunction, methodName, overrideMethod, options ) {
    return _stubOnce('stub', objectOrFunction, methodName, overrideMethod, options);
// TODO:
//    var spy = stub(objectOrFunction, methodName, overrideMethod);
//    spy._saveLimit = 3;
//    spy._restoreAfterCalls = 1;
//    return spy;
}

/*
 * record stats about the call to the stubbed/spied method
 */
function recordMethod( stub, interceptedMethod, interceptedObject, args ) {
    stub.callCount += 1;
    stub.called = true;

    // also intercept callbacks the spied-on function might make
    // TODO: need an option to turn off callback interception
    var lastArg = args.length - 1;
    if (typeof args[lastArg] === 'function') {
        args[lastArg] = interceptCall(stub, args[lastArg], null, recordCallback);
    }

    var isSaveInfo = stub._callResults.length < stub._saveLimit;
    if (isSaveInfo) stub._callArguments.push(args);

    stub.callArguments = args;

    // TODO: restore before callback
    // if (--stub._restoreAfterCalls <= 0) stub.restore();
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
