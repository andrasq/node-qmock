/**
 * Mock objects for testing
 *
 * Copyright (C) 2014 Andras Radics
 * Licensed under the Apache License, Version 2.0
 */

'use strict';

var util = require('util');
var assert = require('assert');
var mongoid = require('arlib/mongoid');

module.exports.QMock = QMock;
module.exports.getMock = getMock;
module.exports.getMockSkipConstructor = getMockSkipConstructor;


/**
 * create a mock object using the constructor function.
 * If called with an existing object instead, will create a mock by cloning
 * the object state and methods.
 */
function getMock( constructor, methods, constructorArgs ) {
    var i, actual;
    methods = methods || [];
    constructorArgs = constructorArgs || [];

    var mock = new QMock();
    // NOTE: constructor must return the 'this' object (not eg a singleton), else will break
    if (typeof constructor === 'function') {
        if (0) {
            // inherit all inherited methods from mocked class
            var builder = function() { constructor.apply(this, constructorArgs); return this; }
            util.inherits(builder, constructor);
            actual = new builder();
        }
        else {
            // inherit all inherited methods from mocked class
            actual = {};
            constructor.apply(actual, constructorArgs);
            for (i in constructor.prototype) {
                if (i in QMock.prototype) throw new Error("cannot inherit existing QMock property " + i);
                mock[i] = constructor.prototype[i];
            }
        }
    }
    else {
        actual = constructor;
    }

    // inherit all properties from mocked class
    for (i in actual) {
        if (i in QMock.prototype) throw new Error("cannot inherit existing QMock method " + i);
        mock[i] = actual[i];
    }

// FIXME: how to mock a class that has an 'expects' method?

    // override all mocked methods with no-ops
    for (i in methods) {
        if (i in QMock.prototype) throw new Error("cannot stub QMock method " + i);
        mock[methods[i]] = function(){ };
    }

    return mock;
}

/**
 * create a mock object with all the methods, but none of the internal state
 */
function getMockSkipConstructor( constructor, methods ) {
    if (typeof constructor !== 'function') {
        return getMock(constructor, methods);
    }
    else {
        actual = {};
        for (i in constructor.prototype) {
            if (i in QMock.prototype) throw new Error("cannot inherit existing QMock property " + i);
            mock[i] = constructor.prototype[i];
        }
        return getMock(actual, methods);
    }
}


function QMock( actual ) {
    if (!this || this === global) return new QMock(actual);
    this._id = mongoid();
    this._expected = [];
}

var expectingMocks = {};
QMock.prototype.expects =  function mockExpects( count ) {
    if (count === undefined) count = 'any';

    switch (count) {
    case 'never': count = 0; break;
    case 'once': count = 1; break;
    case 'twice': count = 2; break;
    case 'any': count = -1; break;
    default:
        if (typeof count !== 'number') throw new Error("unrecognized count " + count);
        break;
    }

    if (!expectingMocks[this._id]) expectingMocks[this._id] = this;
    return new Expected(this._id).expects(count);
};


QMock.unref = function(mockid) {
    expectingMocks[mockid] = undefined;
};
QMock.addExpected = function(mockid, expected) {
    var mock = expectingMocks[mockid];
    mock._expected.push(expected);
    expected.methodFunc = mock[expected.methodName] || function(){ return 'qmock-return'; };
    mock[expected.methodName] = function(){ return expected.execute(expected.methodName, mockid, arguments); };
};
QMock.check = function( mock ) {
    var i;
    for (i in mock._expected) {
        mock._expected[i].check();
    }
    return this;
};

function Expected( mockid ) {
    this.mockid = mockid;
    this.expectedCount = -1;
    this.callCount = 0;
    this.methodName = undefined;
    this.withArguments = undefined;
    this.willReturn = undefined;
    this.methodFunc = undefined;
}
Expected.prototype.expects = function(callCount) {
    this.expectedCount = callCount;
    return this;
};
Expected.prototype.method = function(methodName) {
    if (this.methodName !== undefined) throw new Error("already expecting method " + methodName);
    this.methodName = methodName;
    QMock.addExpected(this.mockid, this);
    return this;
};
Expected.prototype.with = function(/* varargs */) {
    var i, args = [];
    for (i=0; i<arguments.length; i++) args.push(arguments[i]);
    if (this.withArguments === undefined) this.withArguments = [args];
    else this.withArguments.push(args);
    return this;
};
Expected.prototype.will = function(willReturn) {
// FIXME: keep stack of ReturnedValue, which can specify eg point-of-return exceptions
    if (this.willReturn === undefined) this.willReturn = [willReturn];
    else this.willReturn.push(willReturn);
    return this;
};
Expected.prototype.onConsecutiveCalls = function(willReturnValues) {
    if (this.willReturn === undefined) this.willReturn = [];
    var i;
// FIXME: keep stack of ReturnedValue, which can specify eg point-of-return exceptions
    for (i in willReturnValues) this.willReturn.push(willReturnValues[i]);
    return this;
};
Expected.prototype.execute = function(methodName, mockid, arglist) {
    var i, args = [];
    for (i=0; i<arglist.length; i++) args.push(arglist[i]);

    this.callCount += 1;
    if (this.withArguments !== undefined) {
        assert.deepEqual(args, this.withArguments[0], "wrong arguments");
        // reuse the last expected argument for all subsequent calls
        if (this.withArguments.length > 1) this.withArguments.shift();
    }

    if (this.willReturn !== undefined) return this.willReturn.shift();
    // if no return arguments specified, call the actual method
    if (!expectingMocks[mockid]) throw new Error(mockid + ": mock not expecting method");
    return this.methodFunc.apply(expectingMocks[mockid], args);
};
Expected.prototype.check = function( ) {
    function ntimes(n) {
        return n === 0 ? "never" : n === 1 ? "once" : n + " times";
    }
    if (this.expectedCount >= 0 && this.callCount != this.expectedCount) {
        throw new Error("called " + ntimes(this.callCount) + ", expected " + ntimes(this.expectedCount));
    }
};


// QMock class methods for supplying Expected arguments
QMock.any = function() { return -1; };
QMock.never = function() { return 0; };
QMock.once = function() { return 1; };
QMock.twice = function() { return 2; };
QMock.thrice = function() { return 3; };
QMock.exactly = function(n) { return n; };

// FIXME: encapsulate return values in object, so can throw exception at the point of return
QMock.returnValue = function returnValue( value ) { return value; };
QMock.onConsecutiveCalls = function onConsecutiveCalls( valueList ) { return valueList; };
QMock.throwExecption = function throwException( err ) { throw err; }
// TODO: allow full varargs in the callback
QMock.callCallback = function callCallback( cb /*, varargs */ ) { var a = arguments; cb(a[1], a[2], a[3], a[4], a[5]); };
QMock.runFunction = function(func){ /* FIXME: encapsulate run action, run at point of return.  Func() runs as QMock method would. */ };

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
