qmock
=====

[![Build Status](https://api.travis-ci.org/andrasq/node-qmock.svg?branch=master)](https://travis-ci.org/andrasq/node-qmock)
[![Coverage Status](https://codecov.io/github/andrasq/node-qmock/coverage.svg?branch=master)](https://codecov.io/github/andrasq/node-qmock?branch=master)

Light-weight test double library for easier testing of dependency injection style
code.  Patterned somewhat after `phpunit`, which looks like `junit` I believe.

Can stub, spy, and mock classes, objects, and the system timers.

`qmock.getMock(master)` returns a mock object that is instanceof `master`.
The master can be a class (constructor function) or an existing object.
The mock is a fully functional object, with some methods possibly stubbed out.

`qmock` is testing framework agnostic; mocks can be used standalone.  They are
integrated into the [`qnit`](https://npmjs.com/package/qnit) unit test runner.

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
suppress or rewrite method calls.

If an override function is not specified, a noop function is used (changed in 0.4.0).
The noop function does not call its callback, if any.

Use `spy` to passively examine calls to the existing method or function.

Returns a `stub` object that is updated with information about the last call's
arguments, return value, exception thrown, and callback arguments:

### qmock.stub( )

Return an anonymous stub function like `qmock.spy()`.

#### stub.callCount

Number of calls made to the stub.

#### stub.callArguments

Array with the arguments from the last call to the stub.

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

#### stub.restore( )

Remove the stub and restore the original method back onto the object.

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
the method will be replaced with the override.  Returns a `stub` object that holds
information about the calls made.  The object method can be restored to the original
with `stub.restore()`.

The returned `stub` contains the call stats like with `qmock.stub()`, with additional
methods:

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

### qmock.stubOnce( object, methodName [,overrideFunction] )

One-shot stub:  stub the method like `qmock.stub()`, but `restore` the original
method after the first call.

### qmock.spyOnce( object, methodName [,override] )

One-shot spy:  spy on the function or method like `qmock.spy()`, but `restore` the
original after the first call.  Functions cannot be restored, only methods can.

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

### qmock.mockHttp( handler(req, res) )

Override `http.request` and `https.request` to redirect all web requests to the
provided handler.  Each new request will make a call to `handler`.  Request and
response behavior and emulation is up to the handler.  The handler is invoked
immediately after the caller receives the `req` return object.  This function can
be called at any time, each replaces the previous override.  Restore the default
system request functionality with `unmockHttp`.

The callback is passed the handler-supplied or the mock-created `res` as soon as
the `mockResponse` event is emitted on the `req` object.

Note that the handler gets a client-side `http.ClientRequest` (what the client sends
to the server) and `http.IncomingMessage` (what the client receives back), not the
usual server-side `IncomingMessage` and `ServerResponse` objects.

### qmock.mockHttp( )

Experimental.

Without arguments, `mockHttp` mocks an http server, and returns the mock server
object.  The mock server has methods to recognize and respond to calls to mocked
routes.

#### server.when( condition )

Match the route against the condition.  If the route matches `condition`, the actions
that follow will be run to generate the response for the route.

The `http.request` callback is called before the first matching action is run, and the
`'end'` event is emitted when no more actions are left to run.  Note that because the
actions that build the respones have not been run yet, the `res.statusCode` and other
response fields may remain undefined until the res `'end'` event has been received.

Conditions:

- `string` - match the full url or the request pathname against the string
- `RegExp` - match the url or pathname againsdt the regular expression
- `function(req, res)` - use the given function to test whether the route matches

#### server.before( )

The `before` actions are run for all matched routes before their condition actions are run.

#### server.after( )

The `after` actions are run for all matched routes after their condition actions are run.

Actions:

#### server.send( [statusCode], [responseBody], [responseHeaders] )

#### server.write( responseBodyChunk )

#### server.writeHead( [statusCode], [responseHeaders] )

#### server.end( [statusCode], [responseBody] )

#### server.compute( callback(req, res, next) )

#### server.delay( ms )

#### server.emit( event, [arg1, arg2, ...] )

Emit an event on the `res` object.

Example

    var mockServer = qmock.mockHttp()
        .when("http://localhost:1337/test/call")
        .send(204)
        .when("http://localhost:1337/test/error")
        .emit('error', new Error("error 409"))
        .send(409, "test error 409", { 'test-header-1': 'test-value-1' })

    var req = http.request("http://localhost:1337/test/error", function(res) {
        var response = "";
        res.on('data', function(chunk) {
            response += chunk;
        })
        res.on('end', function() {
            assert.equal(res.statusCode, 400);
            assert.equal(response, "test error 409");
            assert.equal(res.headers['test-header-1'], 'test-value-1');
        })
        res.on('error', function(err) {
            console.log("got err '%s'", err.message)
        })
    })
    req.end("test request body");

    // => got err 'error 409'

### qmock.unmockHttp( )

Restore the original system implementations for `http.request` and `https.request`.
This function can be called any time.

Example

    qmock.mockHttp(function(req, res) {
        req.emit('mockResponse');
        res.emit('data', "mock data");
        res.emit('end');
    })
    var req = http.request("http://localhost", function(res) {
        res.on('data', function(chunk) {
            console.log("got:", chunk);
        })
        res.on('end', function() {
            qmock.unmockHttp();
        })
    })
    // => got: mock data


Mock Objects
------------


Change Log
----------

- 0.6.0 - new `mockHttp()` methods `write`, `writeHead`, `end` and `emit`, document `mockHttp()`
- 0.5.5 - fix code and tests to make unit tests pass under node-v0.10
- 0.5.2 - make stub() without args return an anonymous stub function like `spy()`
- 0.5.1 - fix, test and export stubOnce / spyOnce, fix coverage script
- 0.5.0 - `stubOnce` and `spyOnce`
- 0.4.0 - breaking change: `stub()` with a noop function if no override method is given
- 0.3.1 - fix mockHttpServer typos and parser errors (experimental)
- 0.3.0 - extendWithMocks adds stub/spy/mockTimers/mockHttp, mockHttpServer (experimental)
- 0.2.0 - also track stub callbacks, new anonymous `spy` functions, simple http mocking, test with qnit
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

- `inherit()` and `disinherit()` calls: annotate the prototype (inherited properties) of the object,
  for e.g. x = 3; x.__proto__.a = 1
