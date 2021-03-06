/**
 * Mock objects for testing
 *
 * Copyright (C) 2014,2017 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var util = require('util');
var assert = require('assert');
var stub = require('./stub');
var mockTimers = require('./mockTimers');
var mockRequire = require('./mockRequire');
var mockHttp = require('./mockHttp');

var expectingMocks = {};

module.exports = QMock;
module.exports.getMock = getMock;
module.exports.getMockSkipConstructor = getMockSkipConstructor;
module.exports.extendWithMocks = extendWithMocks;
module.exports.stub = stub.stub;
module.exports.spy = stub.spy;
module.exports.stubOnce = stub.stubOnce;
module.exports.spyOnce = stub.spyOnce;
module.exports.mockTimers = mockTimers.mockTimers;
module.exports.unmockTimers = mockTimers.unmockTimers;
module.exports.mockHttp = mockHttp.mockHttp;
module.exports.unmockHttp = mockHttp.unmockHttp;
module.exports.mockRequire = mockRequire.mockRequire;
module.exports.mockRequireStub = mockRequire.mockRequireStub;
module.exports.unmockRequire = mockRequire.unmockRequire;
module.exports.unrequire = mockRequire.unrequire;
module.exports.disrequire = mockRequire.unrequire;
module.exports._expectingMocks = expectingMocks;


/**
 * create a mock object (stub) from a constructor or an existing object.
 * The mock is a fully functional shallow clone, with the named methods
 * stubbed out with noop functions.  For compatibility with phpunit, if
 * methodsToStub is omitted (or is undefined), it stubs out all methods;
 * else if is methodsToStub is not truthy, none of them.
 */
function getMock( mocked, methodsToStub, constructorArgs ) {
    var i;
    mocked = mocked || {};
    constructorArgs = constructorArgs || [];
    var constructor;

    var actual, mock;
    if (typeof mocked === 'function') {
        constructor = mocked;
        // build the mock object using the constructor, so mock will be instanceof constructor
        // NOTE: constructor must return a new object (not eg a singleton), else things will break
        mock = constructor.apply({}, constructorArgs);
        setPrototype(mock, constructor.prototype, constructor);
    }
    else {
        // inherit all properties of mocked object, including prototype methods
        // TODO: how to guard against caller munging (changing methods of) mocked object?
        // TODO: how to correctly handle overridden inherited method?
        //       ie self.method and self.super_.method?
        actual = mocked;
        mock = {};

        // quick shallow clone:
        var keys = Object.getOwnPropertyNames(actual);
        for (i=0; i<keys.length; i++) {
            // TODO: how to handle if the mocked object also has expects/method/check methods?
            // Here we leave the old method, and expect the caller to use QMock.expects(mock), etc.
            // if (keys[i] in QMock.prototype) throw new Error("cannot inherit existing QMock method " + keys[i]);
            // mock[keys[i]] = actual[keys[i]];
            Object.defineProperty(mock, keys[i], Object.getOwnPropertyDescriptor(actual, keys[i]));
        }
        // __proto__ is a ?magic? property, not among getOwnPropertyNames, BUT:
        // instanceof test relies on __proto__.constructor === constructor
        setPrototype(mock, Object.getPrototypeOf(actual) || actual.__proto__, constructor);
    }

    // phpunit stubs all if methods are not passed in, does not stub if null
    if (methodsToStub && typeof methodsToStub !== 'object' || methodsToStub === undefined) {
        // by default, stub out all methods (like phpunit)
        // TODO: confirm that all functions have type 'function'
        for (i in mock) if (typeof mock[i] === 'function') mock[i] = function qmockStub(){};
    }
    else {
        // else stub out only the named methods.  Methods can be an array of
        // method names or an object whose properties are method names.
        for (i in methodsToStub) mock[methodsToStub[i]] = function qmockStub(){};
    }

    // initialize qmock state and attach qmock methods expects() and method()
    QMock.call(mock, actual);

    return mock;
}

function setPrototype( object, proto, constructor ) {
    // TODO: instead of assigning, copy the prototype object
    // TODO: however, the constructor is not enumerable, breaks instanceof
    object.__proto__ = proto;
    //Object.defineProperty(object, '__proto__', { enumerable: false, writable: true });
    //object.contructor = constructor;
    return object;
}

/**
 * create a mock object with all the methods, but none of the internal state
 */
function getMockSkipConstructor( constructor, methods ) {
    if (typeof constructor !== 'function') {
        return getMock(constructor, methods);
    }
    else {
        var i, actual = {};
        var mock = getMock(actual, methods);
        // for mock to be instanceof constructor, we need to hack its __proto__
        mock.__proto__ = constructor.prototype;
        return mock;
    }
}

/**
 * Decorate the tester with methods getMock, getMockSkipConstructor, and
 * arrange for the mock expectations to be checked when the tests are done.
 */
function extendWithMocks( tester, doneMethod ) {
    if (tester.__qmockList) {
        throw new Error("unable to provide mocks, __qmockList already exists");
    }
    tester.__qmockList = [];
    tester.getMock = function getMock(constructor, methods, constructorArgs) {
        var mock = QMock.getMock(constructor, methods, constructorArgs);
        tester.__qmockList.push(mock);
        return mock;
    };
    tester.getMockSkipConstructor = function getMockSkipConstructor(constructor, methods) {
        var mock = QMock.getMockSkipConstructor(constructor, methods);
        tester.__qmockList.push(mock);
        return mock;
    };

    // decorate with all other exported methods too,
    // eg stub, spy, mockTimers, mockHttp
    for (var name in module.exports) {
        if (name !== 'QMock' && name[0] !== '_' && !tester[name]) {
            tester[name] = module.exports[name];
        }
    }

    function tryCheck( mock ) {
        try { QMock.check(mock); QMock.reset(mock); }
        catch (err) { return err; }
    }

    if (!doneMethod) doneMethod = 'done';
    var oldDoneMethod = tester[doneMethod];
    tester[doneMethod] = function() {
        var i, err;
        // catch the assertion errors, finish the test, then re-throw the first.
        // This will have nodeunit avoid a silly "undone tests" error
        for (i=0; i<tester.__qmockList.length; i++) {
            var e = tryCheck(tester.__qmockList[i]);
            err = err || e;
            //QMock.check(tester.__qmockList[i]);
            //QMock.reset(tester.__qmockList[i]);
        }
        // empty the qmock list, in case the tester runs multiple tests (eg mocha)
        tester.__qmockList = [];
        // call the 'done' method before throwing the error to avoid "undone tests"
        if (oldDoneMethod) oldDoneMethod.apply(tester, arguments);
        if (err) throw err;
    };

    return tester;
}


var _nextId = 1;
function QMock( actual ) {
    if (!this || this === global) return new QMock(actual);
    this.__qmock__ = {
        _id: _nextId++,
        _expected: [],
        _hasExpectsMethod: actual && actual.expects,
        _hasMethodMethod: actual && actual.method,
        _hasCheckMethod: actual && actual.check,
    };

    // QMock.call(mock, actual) already attached any actual methods expects, method, check
    // Override with the mock meta-methods.
    // TODO: how to advertise that the mocked class already has an 'expects' method?
    this.expects = actual && actual.expects || QMock.prototype.expects;
    this.method = actual && actual.method || QMock.prototype.method;
    this.check = actual && actual.check || QMock.prototype.check;

    // FIXME: new QMock() does not copy properties, only getMock does!
}

QMock.expects =  function mockExpects( mock, count ) {
    if (count === undefined) count = 'any';

    switch (count) {
    case 'never': count = 0; break;
    case 'once': count = 1; break;
    case 'twice': count = 2; break;
    case 'thrice': count = 3; break;
    case 'any': count = -1; break;
    default:
        if (typeof count !== 'number') throw new Error("unrecognized count " + count);
        break;
    }

    if (!expectingMocks[mock.__qmock__._id]) expectingMocks[mock.__qmock__._id] = mock;

    // returns a new Expected; it will be associated to a method name later
    return new Expected(mock.__qmock__._id).expects(count);
};
QMock.method = function mockMethod( mock, methodName ) {
    // alias for expects(QMock.any()).method(methodName)
    return QMock.expects(mock, 'any').method(methodName);

    // TODO: maybe return the Expected already associated with the method name?
    // returns the Expected associated with the method name
};

/**
 * Traditional use is mock.expects(count).method(name).with(arguments).will(returnAction).
 * Of these, expects() is a method on the mocked object, which can collide
 * with an existing method 'expects'.  To resolve, use QMock.expects(mock, count)
 */
QMock.prototype.expects = function( count ) {
    return QMock.expects(this, count);
};
QMock.prototype.method = function( methodName ) {
    // phpunit compatibility function
    return QMock.method(this, methodName);
};
QMock.prototype.check = function( returnError ) {
    return QMock.check(this, returnError);
};

/**
QMock.unref = function(mockid) {
    expectingMocks[mockid] = undefined;
};
**/
QMock.addExpected = function(mockid, expected) {
    var mock = expectingMocks[mockid];
    mock.__qmock__._expected.push(expected);
    expected.methodFunc = mock[expected.methodName] || function(){ return 'qmock-return'; };
    mock[expected.methodName] = function(){ return expected.execute(expected.methodName, mockid, arguments); };
};
QMock.check = function( mock, returnError ) {
    var i;
    try { for (i in mock.__qmock__._expected) mock.__qmock__._expected[i].check(); }
    catch (err) { if (returnError) return err; else throw err; }
};
QMock.assert = QMock.check;
QMock.reset = function( mock ) {
    // after every test run, reset expectations on any shared objects
    mock.__qmock__.expected = [];
};

function Expected( mockid ) {
    this.mockid = mockid;
    this.expectedCount = -1;
    this.callCount = 0;
    this.methodName = undefined;
    this.withArguments = undefined;
    this.willReturnList = undefined;
    this.methodFunc = undefined;
    this._errors = [];
}
Expected.prototype.expects = function( callCount ) {
    this.expectedCount = callCount;
    // expects() expects calls not yet made, so reset the call count
    this.callCount = 0;
    return this;
};
Expected.prototype.method = function( methodName ) {
    if (this.methodName !== undefined) throw new Error("already expecting method " + this.methodName);
    this.methodName = methodName;
    QMock.addExpected(this.mockid, this);
    return this;
};
Expected.prototype.with = function( /* varargs */ ) {
    var args = _cloneArray(arguments);
    if (this.withArguments === undefined) this.withArguments = [args];
    else this.withArguments.push(args);
    return this;
};
Expected.prototype.willReturn = function( value ) {
    // phpunit compatibility function, shorthand for .will($this->returnValue())
    return this.will(QMock.returnValue(value));
};
Expected.prototype.will = function( willReturn ) {
    if (this.willReturnList === undefined) this.willReturnList = [willReturn];
    else this.willReturnList.push(willReturn);
    return this;
};
Expected.prototype.onConsecutiveCalls = function( willReturnValues ) {
    if (this.willReturnList === undefined) this.willReturnList = [];
    for (var i in willReturnValues) this.willReturnList.push(willReturnValues[i]);
    return this;
};
// execute the mock method.  Unlike php, if the method was not stubbed and
// was not provided a value to return, it will run the supers method and
// return the actual result (while checking the call params and counting the
// number of calls made).  This allows assertions on not just stubs but
// fully functional inherited methods.
Expected.prototype.execute = function( methodName, mockid, arglist ) {
    var i, args = _cloneArray(arglist);

    function checkArguments( args, expected, msg ) {
        var err;
        try { assert.deepEqual(args, expected, msg + ", got " + util.inspect(args) + ", expected " + util.inspect(expected)); }
        catch (e) { err = e; }
        return err;
    }

    this.callCount += 1;
    if (this.withArguments !== undefined) {
        //assert.deepEqual(args, this.withArguments[0], "wrong arguments");
        var err = checkArguments(args, this.withArguments[0], "wrong arguments");
        if (err) this._errors.push(err);
        // reuse the last expected argument for all subsequent calls
        if (this.withArguments.length > 1) this.withArguments.shift();
    }

    if (this.willReturnList !== undefined) {
        // if return value provided, fake the call
        var returnValue;
        if (this.willReturnList[0] instanceof QMockReturnValue) {
            returnValue = this.willReturnList[0].get();
            if (this.willReturnList[0].isEmpty()) this.willReturnList.shift();
            // note: older versions reinterpreted onConsecutiveCalls returned functions
            // as meta-functions that computed the actual return value.  This was wrong;
            // meta-functions are internal to QMock, not exposed.
        }
        else if (typeof this.willReturnList[0] === 'function') {
            var valueComputor = this.willReturnList.shift();
            // expose arglist and self to the return*() function
            returnValue = valueComputor({ self: expectingMocks[mockid], arglist: arglist });
        }
        else {
            returnValue = this.willReturnList.shift();
        }
        return returnValue;
    }
    else {
        // if no return value given, call the actual method
        if (!expectingMocks[mockid]) throw new Error(mockid + ": unknown mock, mock not expecting method");
        return this.methodFunc.apply(expectingMocks[mockid], args);
    }
/**
FIXME: want to support $this->at(), eg:
$mockDb
    ->expects($this->at(1))
    ->method('prepare')
    ->with($this->equalTo($query))
    ->will($this->returnValue($statement));
**/
};
Expected.prototype.check = function( ) {
    if (this.expectedCount >= 0 && this.callCount != this.expectedCount) {
        throw new Error("method " + this.methodName + " was called " + this.callCount + " times, expected " + this.expectedCount);
    }
    if (this._errors.length) {
        throw this._errors[0];
    }
};


/**
 * QMock class methods for supplying Expected arguments
 */
QMock.any = function() { return -1; };
QMock.never = function() { return 0; };
QMock.once = function() { return 1; };
QMock.twice = function() { return 2; };
QMock.thrice = function() { return 3; };
QMock.exactly = function(n) { return n; };


function QMockReturnValue( type, value ) {
    this.type = type;
    this.value = value;
    this.callNumber = 0;
}
QMockReturnValue.prototype.get = function() {
    // TODO: support at()
    var callNumber = this.callNumber++;
    // return (this.type === 'multi') ? this.value.shift() : this.value;
    // note: QMockReturnValue is only used for onConsecutiveCalls multi-value lists
    return this.value.shift();
};
QMockReturnValue.prototype.isEmpty = function() {
    // no more values in this multi-value returnValue
    return (this.type !== 'multi' || this.value.length <= 0);
};


/**
 * QMock class methods for generating mocked method return values.
 */
QMock.returnValue = function returnValue( value ) {
    return function(){ return value; }
};
QMock.returnComputedValue = function returnValue( func ) {
    // AR hack: pass in function to compute the result on demand
    return function(){ return func(); }
};
QMock.returnArgument = function returnArgument( argIndex ) {
    return function(state){ return state.arglist[argIndex]; }
};
QMock.returnSelf = function returnSelf( ) {
    return function(state){ return state.self; }
};
QMock.onConsecutiveCalls = function onConsecutiveCalls( /* varargs */ ) {
    var valueList = _cloneArray(arguments);
    return new QMockReturnValue('multi', valueList);
};
QMock.throwException = function throwException( err ) {
    return function(){ throw err; };
}
QMock.throwError = function throwError( err ) {
    // js alias for throwException
    return function(){ throw err; };
};
QMock.callCallback = function callCallback( cb /*, varargs */ ) {
    var arglist = _cloneArray(arguments, 1);
    return function(){ return cb.apply(null, arglist); };
};


// hand-rolled loop is faster than Array.prototype.slice.call() for < 10 items
function _cloneArray( array, offset ) {
    var i, list = [];
    offset = offset || 0;
    for (i=offset; i<array.length; i++) list.push(array[i]);
    return list;
}


// quick test:
/**

function Test() {
    this.x = 1234;
    return this;
}
Test.prototype.getX = function() { return this.x; }
Test.prototype.get2X = function() { return 2 * this.x; }

var m = getMock(Test);
//m.expects('once').method('foo');
m.expects(QMock.twice()).method('foo')
    .with(1, 2, 3).will(QMock.returnValue(123))
    .with(4, 5).will(QMock.returnValue(456));
console.log("AR: before", m);
console.log("AR: get2X =>", m.get2X());
var x = m.foo(1, 2, 3);
var y = m.foo(4, 5);
console.log("AR: returned", x);
console.log("AR: returned", y);
QMock.check(m);
console.log("AR: after", m);

var m2 = getMock(process);
m2.expects(QMock.twice()).method('exit').will(QMock.returnValue("did not exit"));
console.log( m2.exit(0), ";", m2.exit(0) );
QMock.check(m2);

/**/
