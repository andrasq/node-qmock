qmock
=====

Light-weight test double library for easier testing of dependency injection style
code.  Patterned somewhat after `phpunit`, which looks like `junit` I believe.

Can stub, spy, and mock classes, objects, and the system timers.

`qmock.getMock(master)` returns a mock object that is instanceof `master`.
The master can be a class (constructor function) or an existing object.
The mock is a fully functional object, with some methods possibly stubbed out.

`qmock` is testing framework agnostic; mocks can be used standalone.  I tried
to integrate them into nodeunit, but that's still rough.

Installation
------------

    npm install qmock

Example
-------

    qmock = require('qmock');

    // mock an existing object
    var mock = qmock.getMock(console);

    // instrument log() and ensure that it is called with 'hello'
    // full phpunit syntax should also work, ie
    // mock.expects(qmock.twice()).method('log').with('hello');
    mock.expects(2).method('log').with('hello');
    mock.log('hello');
    qmock.check(mock);      // assertion error, called 1 times, expected 2

    // with() is sticky, all subsequent calls must also match
    mock.log('world');
    qmock.check(mock);     // assertion error, 'world' !== 'hello'

    // methods don't have to already exist.  create and call a stub method
    // by specifying what it will return:
    mock.expects(1).method('boom').will(qmock.throwError(new Error("BOOM!")));
    mock.boom();            // error throw, BOOM!


Api
---

### qmock.getMock( master, methodNames [,constructorArgs] )

If master is a class (a constructor function), returns a mock object built with the
given constructorArgs.

If master is an object, an identical object is cloned.  The clone will be
instanceof the same class as `master`, and will have the same own and inherited
properties as `master`.

In both cases, some or all of the named methods are replaced by no-op stubs.  If
`methodNames` is given as falsy, no methods are stubbed; if an Array, the named
methods are stubbed; if not passed, all methods are stubbed.

Example:

    var fakeLogger = qmock.getMock({}, ['log']);
    fakeLogger.log("test message");

### qmock.getMockSkipConstructor( master, methodNames )

Build a mock object like `getMock` but do not initialize the object.  The returned
object will still have the instance, own and inherited properties of `master`, but
will be completely un-initialized.

If master is an existing object, this call is identical to `getMock`.

### qmock.stub( object, methodName [,overrideFunction] )

Replace the named method of `object` with the override function, and return a stub
object that holds information about calls to the method.  This form can be used to
override or rewrite method calls.

If an override function is not specified, the original method is called.  This form is
useful to passively "spy" on method calls.

Returns a `stub` object:

#### stub.restore( )

Remove the stub and restore the original method back onto the object.


#### stub.callCount

Number of calls made to the stub.

#### stub.callArguments

Array with the arguments from the last call to the stub.  Also available as `stub.args`.

#### stub.callResult

Last value returned from the stub function, `undefined` if it threw an `Error`.

#### stub.callError

The error generated by the last call to the stub function, `null` if none.  A
successful call following a call that threw replaces the error with `null`.

#### stub.error

Like `stub.callError`, but `error` is sticky, and contains the last error thrown by
any call to the stub.

#### stub.callCallbackArguments

If the last argument passed to a stub is a function, it will be assumed to be the
callback.  A copy of the arguments passed to the callback will be be in
`callCallbackArguments`.  Note:  callbacks are not synchronized with calls to the
stub, so the callback arguments may not be from the most recent call.

Example:

    var qmock = require('qmock');
    var assert = require('assert');

    var stub = qmock.stub(process, 'exit', function(){});
    process.exit(1);
    process.exit(2, 3);
    console.log("did not exit");
    // => did not exit

    assert.equal(stub.callCount, 2);
    assert.deepEqual(stub.callArguments, [2, 3]);

    stub.restore();
    process.exit();
    // process exited, program stopped

    console.log("this line will not appear");
    // no output, line not reached

### qmock.spy( [func] )

Spy on calls to the given function.  Returns an instrumented function that tracks
calls to `func`.  If no func is given, an anonymous function is created to be spied
on, which can then be passed as eg a callback.  Returns the spy function.  The stats
are accessible in the property `spy.stub`.

Example

    var qmock = require('qmock');
    var originalWrite = process.stderr.write;
    process.stderr.write = qmock.spy(function(str, cb) {
        console.log("would have written %d bytes", str.length);
        if (cb) cb();
    });
    process.stderr.write("test message\n");
    // => would have written 13 bytes

    process.stderr.write = originalWrite;
    process.stderr.write("another message\n");
    // => another message

### qmock.spy( object, methodName [,override] )

Spy on calls to the named method of the object.  If the `override` function is given,
the method will be replaced with the override.  Returns a `methodStub` object that
holds stats about the calls made.  The object method can be restored to the original
with `methodStub.restore()`.

The returned `methodStub` contains the call stats like with `qmock.stub()`, with
additional methods:

Example

    var qmock = require('./');
    var stub = qmock.spy(process.stderr, 'write', function(str, cb) {
        console.log("would have written %d bytes", str.length);
        if (cb) cb();
    });
    process.stderr.write("test message\n");
    // => would have written 13 bytes

    stub.restore();
    process.stderr.write("another message\n");
    // => another message

#### stub.getAllArguments( )

Return the argument vectors passed to the first 10 calls of the spied function.
For convenience, this information is also available in the `stub.args` array.

#### stub.getAllResults( )

Return the values returned by the first 10 calls to the spied function.

#### stub.getAllErrors( )

Return the errors thrown by the first 10 calls to the spied function.  If no error
was thrown by a call, the array contains a `null` entry for it.

#### stub.getAllCallbackArguments( )

Return the argument vectors passed to the stub callback.  The callback is recognized
as a function passed as the last value in the stub arguments list.  Note that
callbacks may be called out of order, so the returned argument may not match 1-to-1
the stub arguments passed in `getAllArguments`.

### qmock.mockTimers( )

Replace the nodejs timers functions `setImmediate`, `clearImmediate`, `setTimeout`
et al with mocked versions whose time is not linear and is not limited by real
time.  Returns a clock object.  To restore the timers back to their original
unmodified versions, use `qmock.unmockTimers()`.

This function can be called any number of times, each call replaces the previous
timers calls in effect with a new set.  Note that any pending immediates and timeouts
in the system timers will still trigger, but with follow-up timeouts queued into the
mock.

Returns a mock timeouts `clock`.

#### clock.tick( [n] )

Advances mock timers time by `n` milliseconds (default 1).  Immediates and timeouts
are run as they come due, immediates before timeouts.  0 milliseconds runs only the
immediates.

#### clock.immediates

The array of immediate tasks that will execute on the next event loop `tick`.

#### clock.timeouts

A hash indexed by the expiration timestamp of arrays of timeouts.

#### clock.timestamp

The current mock timers timestamp that is advanced by `tick`.

Example:

    var qmock = require('qmock');
    var clock = qmock.mockTimers();
    setTimeout(function() {
        console.log("timeout");
        setImmediate(function() {
            console.log("immediate");
            qmock.unmockTimers();
        });
    }, 10);
    clock.tick(9);
    // => (nothing)
    clock.tick(1);
    // => "timeout"
    clock.tick(0);
    // => "immediate"

### qmock.unmockTimers( )

Restore the global `setImmediate`, `setTimeout` etc functions back to their inital
original nodejs versions.  Can be called any time.  Note that any pending timeouts
in the active mock timers will trigger if strobed with `clock.tick()`.

Mock Objects
------------


Change Log
----------

- 0.2.0 - also track stub callbacks, anonymous `spy` functions, gtest with qnit
- 0.1.0 - `stub()` and `mockTimers()`, initial `spy()`
- 0.0.8 - Jan 2015 version

Todo
----

- qmocks are awkward the way they hook into unit tests.  For nodeunit,
  qmock.extendWithMocks(test, 'done') will add a getMock() method to the currently
  running test and will check any created mocks for having met their expected
  assertions on test.done().  It would be nicer if tie-in were made once, not
  per test.

- the nodejs property getter/setter methods should make it possible for data
  properties to be mocked too, eg getMockValue(name).  with() could map to
  set, will() to get.

- introduce a havingReturned() method to be able to inspect not just the
  called with arguments but the method return value as well

- add returnCallback() method to return err, for callbacks not just direct returns

- clone un-enumerable properties as well, retaining their original definitions
