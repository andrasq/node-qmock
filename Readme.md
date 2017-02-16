qmock
=====

Light-weight test double library for easier testing of dependency injection style
code.  Patterned somewhat after `phpunit`, which looks like `junit` I believe.

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
    mock.log('world');      // assertion error, 'world' !== 'hello'

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

### qmock.stub( object, methodName [,userFunction] )

Replace the named method of `object` with the user function, and return a stub that
will contain information about calls to the method.  This can be used to override
or rewrite method calls.

If a user function is not specified, the original method is used.  This form is
useful for passive "spying" on method calls.

The returned stub object has a method `restore()` that will remove the stub and
restore the original method onto the object.

Example:

    var qmock = require('qmock');
    var assert = require('assert');
    var stub = qmock.stub(process, 'exit', function(){});
    process.exit();
    process.exit();
    console.log("still here");
    assert(stub.callCount == 2);
    stub.restore();
    process.exit();
    console.log("this line will not appear");

### qmock.mockTimers( )

Replace the nodejs timers functions `setImmediate`, `clearImmediate`, `setTimeout`
et al with mocked versions whose time is not linear and is not limited by real
time.  Returns a clock object.  To restore the timers back to what they were when
mockTimers was called, call `clock.uninstall()`.

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

#### qmock.unmockTimers( )

Restore the global `setImmediate`, `setTimeout` etc functions to their inital
original nodejs versions.  Can be called any time.  Note that any pending timeouts
in the active mock timers will only trigger if strobed with `clock.tick()`.

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

Mock Objects
------------



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
