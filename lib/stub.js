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


// call sequence number, for before/after testing
var _callCounter = 0;

// spy on calls to the function or method, return the instrumented spy function
// Invokes the function or method unless the user provided an overrideMethod.
function spy( objectOrFunction, methodName, overrideMethod ) {
    // TODO: merge into stub()
    var args = normalizeArgs(objectOrFunction, methodName, overrideMethod);
    var object = args.ob, methodName = args.me, overrideMethod = args.ov;

    // if nothing given to spy on, spy on an anonymous stub instead
    var _spy = stub.stub(object, methodName, overrideMethod || object[methodName] || 'stub')
        .configure('saveLimit', 10);
    return _spy;
}

// spy on calls to the stub, return the instrumented stub function
// Invokes the user-provided stub `overrideMethod`, else uses the built-in logic.
function stub( objectOrFunction, methodName, overrideMethod ) {
    var args = normalizeArgs(objectOrFunction, methodName, overrideMethod);
    var object = args.ob, methodName = args.me, overrideMethod = args.ov;

// TODO: if function is a constructor, should patch up spy.__proto__ and spy.constructor

    if (overrideMethod && typeof overrideMethod !== 'function' && overrideMethod !== 'stub') throw new Error("override not a function");
    if (overrideMethod == undefined) overrideMethod = 'stub';

    var self = objectOrFunction === object ? object : undefined;
    var context = new QmockStubContext(object, methodName, overrideMethod, self);

    // intercept calls to the stub to track statistics
    var _spy = object[methodName] = function _spy() {
        var argv = new Array();
        for (var i=0; i<arguments.length; i++) argv[i] = arguments[i];

        return _spy.recordMethod(_spy, _spy._overrideMethod, this, argv);
    }

    // copy over the stub context properties and methods
    for (var k in context) _spy[k] = context[k];

    // backward compat: make the context available as .stub
    _spy.stub = _spy;

    return _spy;
}

// spy but restore after one call
function spyOnce( objectOrFunction, methodName, overrideMethod ) {
    var _spy = stub.spy(objectOrFunction, methodName, overrideMethod)
        .configure('saveLimit', 10)
        .configure('restoreAfterCalls', 1);
    return _spy;
}

// stub but restore after one call
function stubOnce( objectOrFunction, methodName, overrideMethod ) {
    var _spy = stub.stub(objectOrFunction, methodName, overrideMethod)
        .configure('saveLimit', 3)
        .configure('restoreAfterCalls', 1);
    return _spy;
}


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

// record stats about the call to the stubbed/spied method
function recordMethod( stub, interceptedMethod, interceptedThisObject, args ) {
    stub.callNumber = ++_callCounter;
    stub.callCount += 1;
    stub.called = true;
    stub.callArguments = args.slice();

    var isSaveInfo = stub._callResults.length < stub._saveLimit;
    if (isSaveInfo) stub._callArguments.push(stub.callArguments);
    if (isSaveInfo) stub._callNumbers.push(stub.callNumber);

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
        // mock the method returns/yields/throws behavior
        var ret = stub._retvals[0];
        if (ret.once) stub._retvals.shift();
        if (ret.yields) {
            // note: nodejs v8 does not guarantee that the clock will have advanced by 2 ms
            if (ret.async) setTimeout(function(){ cb.apply(null, ret.yields) }, 2);
            else if (ret.isError) setImmediate(function(){ cb.apply(null, ret.yields) });
            else cb.apply(null, ret.yields);
        }
    } else {
        // invoke the specified function/method/overrideMethod
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

// object to holds the possible built-in stubbed returns/yields/throws responses
function Retval( err, ret, yields, once, async ) {
    this.isError = err != undefined;
    this.err = err;
    this.ret = ret;
    this.yields = yields;
    this.once = once;
    this.async = async;
}

// TODO: would be nice to wrap intercept, but nicer to have the descriptive function names
// function intercept( fname, handler ) {
//     return function _spy( /* VARARGS */ ) {
//         var args = new Array();
//         for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
//         // invoke the handler with the `this` that the intercept is attached to
//         return handler.call(this, args);
//     }
//     //return new Function(x.replace(/^function /, 'function ' + fname));
// }

function QmockStubContext( object, methodName, overrideMethod, thisObject ) {
    this._type = 'QmockStubContext'

    this.callCount = 0;
    this.callArguments = null;
    this.callReturn = null;
    this.callResult = null;
    this.callError = null;
    this.callCallbackArguments = new Array();
    this.callCallbackError = null;
    this.callNumber = 0;
    this.error = null;

    this._thisObject = thisObject;
    this._object = object;
    this._methodName = methodName;
    this._method = object[methodName];
    this._hadNamedMethod = object.hasOwnProperty(methodName);
    this._overrideMethod = overrideMethod;

    // values to return: the last one is permanent, others in front are use-once
    this._retvals = new Array(new Retval());

    this._restoreAfterCalls = Infinity;
    this._saveLimit = 3;

    this._callArguments = [];
    this._callResults = [];
    this._callErrors = [];
    this._callCallbackArguments = [];
    this._callCallbackErrors = [];
    this._callNumbers = [];

    this.called = false;
    this.args = 'set below';

    // minor sinon compatibility
    this.args = this._callArguments;
    this.returnValues = this._callResults;
    this.exceptions = this._callErrors;
}

QmockStubContext.prototype.restore = function restore( ) {
    if (this._hadNamedMethod) return this._object[this._methodName] = this._method;
    else delete this._object[this._methodName];
}

QmockStubContext.prototype.recordMethod = recordMethod;

QmockStubContext.prototype.configure = function configure( name, value ) {
    this['_' + name] = value;
    return this;
}

QmockStubContext.prototype.getAllArguments = function() {
    return this._callArguments;
}
QmockStubContext.prototype.getAllResults = function() {
    return this._callResults;
}
QmockStubContext.prototype.getAllErrors = function() {
    return this._callErrors
}
QmockStubContext.prototype.getAllCallbackArguments = function() {
    return this._callCallbackArguments
}

QmockStubContext.prototype.yields = function _yields( /* VARARGS */ ) {
    // TODO: callsArgWith() to call back to other than first callback arg, with args
    // TODO: yieldsTo(method, ...args) calls the property of the (first) matching argument
    var args = new Array();
    for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
    this._overrideMethod = 'stub';
    this._retvals[this._retvals.length - 1].yields = args;
    return this;
}
QmockStubContext.prototype.yieldsAsync = function _yieldsAsync( /* VARARGS */ ) {
    var args = new Array();
    for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
    this._overrideMethod = 'stub';
    this._retvals[this._retvals.length - 1].yields = args;
    this._retvals[this._retvals.length - 1].async = true;
    return this;
}
QmockStubContext.prototype.returns = function _returns( val ) {
    // TODO: returns(val), returnsArg(n), returnsThis()
    this._overrideMethod = 'stub';
    this._retvals[this._retvals.length - 1].ret = val;
    return this;
}
QmockStubContext.prototype.throws = function _throws( err ) {
    // TODO: (), ("TypeName"), (obj)
    this._overrideMethod = 'stub';
    this._retvals[this._retvals.length - 1].isError = true;
    this._retvals[this._retvals.length - 1].err = err;
    return this;
}
QmockStubContext.prototype._mockOnce = function __mockOnce( err, ret, yields, async ) {
    // TODO: maybe fold this method into `configure`
    if (yields != null && !Array.isArray(yields)) throw new Error("_mockOnce: yields expects an array");
    this._overrideMethod = 'stub';
    var retval = this._retvals.pop();
    var onceval = new Retval(err, ret, yields, true, async);
    this._retvals.push(onceval);
    this._retvals.push(retval);
    return this;
}
QmockStubContext.prototype.yieldsOnce = function _yieldsOnce( /* VARARGS */ ) {
    var args = new Array();
    for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
    return this._mockOnce(undefined, undefined, args);
}
QmockStubContext.prototype.yieldsAsyncOnce = function _yieldsAsyncOnce( /* VARARGS */ ) {
    var args = new Array();
    for (var i=0; i<arguments.length; i++) args[i] = arguments[i];
    return this._mockOnce(undefined, undefined, args, true);
}
QmockStubContext.prototype.returnsOnce = function _returnsOnce( val ) {
    return this._mockOnce(null, val);
}
QmockStubContext.prototype.throwsOnce = function _throwsOnce( err ) {
    return this._mockOnce(err);
}
// ??? QmockStubContext.prototype.callsBack = QmockStubContext.prototype.yields;
QmockStubContext.prototype.getCall = function _getCall( n ) {
    return {
        proxy: {},
        this: this._thisObject,
        args: this._callArguments[n],
        returnValue: this._callResults[n],
        exception: this._callErrors[n],
        stack: undefined
    }
}
QmockStubContext.prototype.calledAfter = function _calledAfter( spy ) {
    return this.callNumber > spy.callNumber;
}
QmockStubContext.prototype.calledBefore = function _calledBefore( spy ) {
    return this.callNumber < spy.callNumber;
}
