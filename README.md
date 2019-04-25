qmock
=====

[![Build Status](https://api.travis-ci.org/andrasq/node-qmock.svg?branch=master)](https://travis-ci.org/andrasq/node-qmock)
[![Coverage Status](https://coveralls.io/repos/github/andrasq/node-qmock/badge.svg?branch=master)](https://coveralls.io/github/andrasq/node-qmock?branch=master)

Light-weight test double library for easier testing of dependency injection style
code.  Patterned somewhat after `phpunit`, which looks like `junit` I believe.

Can [stub, spy](#stub-and-spy-api), and [mock classes, objects](#mock-objects-api), the
[system timers](#mock-timers-api), [`require()`](#mock-require-api) and [http calls](#mock-http-api).

`qmock` is testing framework agnostic; mocks can be used standalone.  They are
integrated into the [`qnit`](https://npmjs.com/package/qnit) unit test runner.


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


Mock Objects API
----------------

`qmock.getMock(master)` returns a mock object that is instanceof `master`.
The master can be a class (constructor function) or an existing object.
The mock is a fully functional object, with some methods possibly stubbed out.

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


## Mock Objects


Stub and Spy API
----------------

Stubs are stand-in methods that track and instrument calls.  Spies are fully
functional methods annotated with instrumentation.  Their functionality overlaps.

A spy instruments an existing method (or function) and tracks calls made to it.  The
original method contiues to work exactly as before.

A stub temporarily replaces an existing method (or function), or creates an anonymous
function and spies on the replacement.  The original method will not be accessible
until after it's `restore`-d.

### qmock.spy( [func] )

Spy on calls to the given function.  Returns an instrumented function that tracks
calls to `func`.  If no func is given, an anonymous function is created to be spied
on, which can then be passed as eg a callback.  Returns the spy function.  The stats
are accessible as properties on the `spyFunc`, or in its property `spyFunc.stub`.

Example

    var qmock = require('qmock');
    var computeFunc = function(a, b) { return a + b };
    var spyFunc = qmock.spy(computeFunc);

    var c = spyFunc(1, 2);
    computeFunc = spyFunc.restore();

    // c => 3
    // spyFunc.callCount => 1
    // spyFunc.callArguments => [1, 2]
    // spyFunc.callResult = 3

### qmock.spy( object, methodName [,override] )

Spy on calls to the named method of the object.  If the `override` function is given,
the method will be replaced with the override.  Returns a `spy` function that holds
information about the calls made.  The object method can be restored to the original
with `spy.restore()`.

The returned `spy` contains the call stats like `qmock.stub()`, with additional
methods (see [Stub and Spy API](#stub-and-spy-api), below).

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

### qmock.stub( )

With no arguments, returns an instrumented anonymous function like `qmock.spy()`.

### qmock.stub( func )

Return an instrumented anonymous function to replace `func`.  `restore()` returns
the original `func`.

Example:

    process.exit = qmock.stub(process.exit);
    process.exit();
    // did not exit!
    process.exit = process.exit.restore();

### qmock.stub( object, methodName [,overrideFunction] )

Replace the named method of `object` with an anonymous noop function or the specified
override, and return a stub method that will contain information about calls to the
method.  This form can be used to suppress or rewrite method calls.

If an override function is not specified, a noop function is used (changed in 0.4.0).
The noop function does not call its callback, if any.

If `object` does not have a method `methodName`, one will be created for it.  The
overridden object property will be restored to its original value (or deleted if it
did not exist) upon `stub.restore()`.

Use `spy` to passively examine calls to an existing method or function.

Returns a `stub` object that is updated with information about the last call's
arguments, return value, exception thrown, and callback arguments:

### qmock.stubOnce( object, methodName [,overrideFunction] )

One-shot stub:  stub the method like `qmock.stub()`, but `restore` the original
method after the first call.

### qmock.spyOnce( object, methodName [,override] )

One-shot spy:  spy on the function or method like `qmock.spy()`, but `restore` the
original after the first call.


### Stub and Spy Methods

### stub.returns( value )

Make the stub return `value` when called.  Returns the `stub` for call chaining.
Calling `returns` on a spy converts it into a stub.

### stub.yields( [val1, [val2, ...]] )

Make the stub call its callback with the provided values `[val1, val2, ...]`.  The callback
is assumed to be the first function in the stub argument list.  Returns the `stub` for chaining.
Calling `yields` on a spy converts it into a stub.

The callback is invoked synchronously, before the stub returns.  Use `yieldsAsync` to
call back after a small pause.

### stub.yieldsAsync( [val1, [val2, ...]] )

Like `stub.yields`, but invoke the callback asynchronously, after a short pause.

### stub.throws( error )

Make the stub throw the given `error` value.  Returns the `stub` for chaining.
If a stub both yields and throws, it will throw first and call the callback on the
next event loop tick.
Calling `throws` on a spy converts it into a stub.

### stub.onCall( n )

Make all subsequent `returns`, `yields` and `throws` calls configure the n-th
(0-based) use-once retval.  Call `onCall(-1)` to restore the default behavior of
configuring the permanent retval.

### stub.returnsOnce( value )

Like `stub.returns`, but only returns the value once.  Creates a new use-once retval
and configures it to return `value`.  `returnsOnce` actions are performed in sequence,
so `stub.returnsOnce(1).returnsOnce(2)` will return first 1 then 2.  Returns the `stub`
for call chanining.

After all `stub.returnsOnce` values have been returned, all subsequent calls will
return the `stub.returns` value.

### stub.yieldsOnce( [val1, [val2, ...]] )

Like `stub.yields`, but calls back with these values only once.  See also `returnsOnce`.

The callback is invoked synchronously, before the stub returns.  Use `yieldsAsyncOnce`
to call back after a small pause.

### stub.yieldsAsyncOnce( [val1, [val2, ...]] )

Like `stub.yieldsOnce` but invoke the callback asynchronously, after a short pause.


### stub.throwsOnce( error )

Like `stub.throws`, but throws only once.  See also `returnsOnce`.

### stub.restore( ), spy.restore( )

Unhook the spy or stub, and restore the original method back onto the object.
Returns the original spied-on/stubbed method, function, or property.

### stub.getCall( n )

Return the n-th (0-based) call details.  The details include the the call `args`,
its `returnValue`, and any `exception` thrown.


### Stub and Spy Properties

### stub.callCount

Number of calls made to the stub.

### stub.callArguments

Array with the arguments from the last call to the stub.

### stub.callResult

Last value returned from the stub function, `undefined` if it threw an `Error`.

### stub.callError

The error generated by the last call to the stub function, `null` if none.  A
successful call following a call that threw replaces the error with `null`.

### stub.error

Like `stub.callError`, but `error` is sticky, and contains the last error thrown by
any call to the stub.

### stub.callCallbackArguments

If a spied-on method is passed an argument of type "function", it will be assumed to
be the method callback and will be instrumented to track what it returns.  A copy of
the callback arguments with will be placed into `spy.callCallbackArguments`.  Only the
first function-type argument is instrumented.

Note:  callbacks are not synchronized with calls to the stub, so the callback
arguments may not be from the most recent call.

Note: qmock versions 0.10.2 and earlier looked for a callback only in the last
argument position; qmock 0.11.0 and up look for the first argument of type "function".

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


### spy.args
### spy.getAllArguments( )

Return the argument vectors passed to the first 10 calls of the spied function.
For convenience, this information is also available in the `spy.args` array.

### spy.returnValues
### spy.getAllResults( )

Return the values returned by the first 10 calls to the spied function.
Also available as `spy.returnValues`.

### spy.exceptions
### spy.getAllErrors( )

Return the errors thrown by the first 10 calls to the spied function.  If no error
was thrown by a call, the array contains a `null` entry for it.
Also available as `spy.exceptions`.

### spy.getAllCallbackArguments( )

Return the argument vectors passed to the stub callback.  The callback is recognized
as a function passed as the last value in the stub arguments list.  Note that
callbacks may be called out of order, so the returned argument may not match 1-to-1
the stub arguments passed in `getAllArguments`.

Example

    var qmock = require('./');
    var spy = qmock.spy(process.stderr, 'write', function(str, cb) {
        console.log("would have written %d bytes", str.length);
        if (cb) cb();
    });
    process.stderr.write("test message\n");
    // => would have written 13 bytes

    spy.restore();
    process.stderr.write("another message\n");
    // => another message


Mock Timers API
---------------

`mockTimers` overrides the system setImmediate, setTimeout, etc calls with mock
work-alikes that trigger under user control.  `unmockTimers` restores the system
timers.

## qmock.mockTimers( )

Replace the nodejs timers functions `setImmediate`, `clearImmediate`, `setTimeout`
et al with mocked versions whose time is not linear and is not limited by real
time.  Returns a clock object.  To restore the timers back to their original
unmodified versions, use `qmock.unmockTimers()`.

This function can be called any number of times, each call replaces the previous
timers calls in effect with a new set.  Note that any pending immediates and timeouts
in the system timers will still trigger, but with follow-up timeouts queued into the
mock.

Returns a mock timeouts `clock` that controls the passage of events time:

### clock.tick( [n] )

Advances mock timers time by `n` milliseconds (default 1).  Immediates and timeouts
are run as they come due, immediates before timeouts.  0 milliseconds runs only the
immediates.

### clock.immediates

The array of immediate tasks that will execute on the next event loop `tick`.

### clock.timeouts

A hash indexed by the expiration timestamp of arrays of timeouts.

### clock.timestamp

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

## qmock.unmockTimers( )

Restore the global `setImmediate`, `setTimeout` etc functions back to their inital
original nodejs versions.  Can be called any time.  Note that any pending timeouts
in the mock timers can still be triggered with `clock.tick()`.


Mock Require API
----------------

`mockRequire` overrides `require` everywhere to return the mock value
for the named modules.

## qmock.mockRequire( moduleName, replacement )

Arrange for `require` of `moduleName` to return `replacement` in all sources,
even if `moduleName` had been loaded previously.  Calls to `mockRequire` are
cumulative, each one defines one more module that will be mocked.

It is an error for `moduleName` to be falsy.

## qmock.mockRequireStub( moduleName, handler )

Stub `require` of `moduleName` with the provided handler function, and return the
value it computes.  Handler is invoked as `handler(moduleName)`.

## qmock.unmockRequire( [moduleName] )

If `moduleName` is provided, arrange for `require` of `moduleName` to load
the actual module and not the mock replacement value.

Without a module name, uninstall the mock require hooks and restore the
original unmodified system `require` functionality.  All previously defined
module mocks are cleared.

## qmock.unrequire( moduleName )

Helper function to restore the system to the state it was in before
the named module was ever `require`-d.  It deletes all cached copies of the
module from `require.cache`, `module.children`, `module.parent.children` etc.


Mock Http API
-------------

`mockHttp` overrides `http.request` and `https.request` with mocks that return
user supplied values.  `unmockHttp` restores the system http functions.

## qmock.mockHttp( handler(req, res) )

Override `http.request` and `https.request` to redirect all web requests to the
provided handler.  Each new request will make a call to `handler`.  Request and
response behavior and emulation is up to the handler.  The handler is invoked
immediately after the caller receives the `req` return object.  This function can
be called at any time, each replaces the previous override.  Restore the default
system request functionality with `unmockHttp`.

The `request` callback is passed the mock `res` object or the `res` supplied by the
handler as asson as `mockResponse` event is emitted `req.emit('mockResponse', [res])`.

Note that the handler gets a client-side `http.ClientRequest` (what the client sends
to the server) and `http.IncomingMessage` (what the client receives back), not the
usual server-side `IncomingMessage` and `ServerResponse` objects.

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

## qmock.mockHttp( )

Without arguments, `mockHttp` mocks an http server, and returns the mock server
object.  The mock server has methods to recognize and respond to calls to mocked
routes.

    server = qmock.mockHttp();
    server.when('http://localhost/test')
      .end(200, 'Hello, test.');

### server.when( condition )

Match the route against the condition.  If the route matches `condition`, the actions
that follow will be run to generate the response for the route.  Only the first matching
condition will have its actions run.

The `http.request` callback is called before the first matching action is run, and the
`'end'` event is emitted when no more actions are left to run.  Note that because the
actions that build the respones have not been run yet, the `res.statusCode` and other
response fields may remain undefined until the res `'end'` event has been received.

Conditions:

- `string` - match the full url or the request pathname against the string
- `METHOD:string` - match the full annotated url or annotated request pathname against the string,
  The annotated url would look something like "POST:http://localhost:80/pathname".
- `RegExp` - match the url or pathname against the regular expression
- `function(req, res)` - use the given function to test whether the route matches

Examples:

    .when('http://localhost:80/')       - match any http request to localhost port 80
    .when(/\/test\//)                   - match any request with "/test/" in its pathname
    .when(/^POST:/)                     - match any POST request
    .when(/^/)                          - match any request
    .when(function(req, res) {          - match any request with Basic user:pass authorization
        return (req._headers['authorization'].indexOf('Basic ') === 0);
    })

### server.on( condition )

An alias for `server.when`.

### server.once( condition )

Like `server.when`, but the condition will be matched only once.  After the first match,
it will not match any other request.  This allows the mock to return different responses
to the same request.  The matching actions are run in the order defined.

    qmock.mockHttp()
        .once('http://host/getNext')
          .send(200, 'data1')
        .once('http://host/getNext')
          .send(200, 'data2')
        .once('http://host/getNext')
          .send(500, 'no more data');

    // http.request('http://host/getNext') => 'data1', statusCode 200
    // http.request('http://host/getNext') => 'data2', statusCode 200
    // http.request('http://host/getNext') => 'no more data', statusCode 500

### server.default( )

An alias for a condition that always matches the route, equivalent to `.when(/.*/)`.
Define a `default` as the very last condition, because conditions are tested in the
order defined and the default always matches all routes so no other conditions will
be tested.

### server.before( )

The `before` actions are run for all matched routes before their condition actions are run.

### server.after( )

The `after` actions are run for all matched routes after their condition actions are run.

Actions:

### server.send( [statusCode], [responseBody], [responseHeaders] )

Set the response `statusCode` and `responseHeaders`, write the `responseBody`, and
finish the response.  No more data should be written after the response has been
finished.

### server.send( responseFunction(req, res, next) )

Call the provided `responseFunction` to generate the response.

### server.write( responseBodyChunk )

Cause `res` to emit a `'data'` event with the given chunk.

### server.writeHead( [statusCode], [responseHeaders] )

Set the response statusCode and headers.

### server.end( [statusCode], [responseBody] )

Same as `send`:  set the statusCode, write the reply and finish the response.

### server.compute( callback(req, res, next) )

Invoke the provided callout, let it adjust `res`.

### server.delay( ms )

Pause for `ms` milliseconds before continuing with the rest of the condition actions.

### server.emit( event, [arg1, arg2, ...] )

Emit an event on the `res` object.

### server.throw( err )

Emit the error event on the `req` object.

### server.makeRequest( [url [,body [,headers]]] )

Without arguments, replays the mock request:  makes a real http request with the same
arguments as the mock, and relays the real http response to the mock response.

With arguments, makes an http request to the specified url string or object, optionally
with the given request body and request headers, and relays the real http response back
to the mock response.  Body, if specified, must be a string or Buffer.

The default request method is GET, use a uri object to override.

Here's an example that mocks just the third call, making actual web requests for the
first, second, fourth and all subsequent calls:

    // mock just the third call to 'localhost:80'
    mock = qmock.mockHttp()
        .once("http://localhost:80").makeRequest()      // first call
        .once("http://localhost:80").makeRequest()      // second call
        .once("http://localhost:80").send(404, 'override with Not Found')
        .when("http://localhost:80").makeRequest()      // all other calls

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
            assert.equal(res.statusCode, 409);
            assert.equal(response, "test error 409");
            assert.equal(res.headers['test-header-1'], 'test-value-1');
        })
        res.on('error', function(err) {
            console.log("got err '%s'", err.message)
        })
    })
    req.end("test request body");

    // => got err 'error 409'

## qmock.unmockHttp( )

Restore the original system implementations for `http.request` and `https.request`.
This function can be called any time.


Change Log
----------

- 0.15.0 - expose `disrequire` under the package name as well (alias of unrequire),
           upgrade disrequire to hugely improve worst case speed
- 0.14.3 - make mockHttpServer match paths by full url, path+query, or just pathname
- 0.14.2 - patch mockHttp to handle incomplete mockRequest uri, fix mockHttp makeRequest to return with response
- 0.14.1 - upgrade disrequire for fix to resolveOrSelf of caller of anonymous function
- 0.14.0 - use the `unrequire` code moved into the `disrequire` package, fix `makeRequest` call method handling
- 0.13.1 - improve mockRequire code coverage (qmock now at 100%), also test with node-v9
- 0.13.0 - new `server.makeRequest` mock http server call, fix onConsecutiveCalls to be able to return plain functions
- 0.12.0 - new `stub.onCall` and `stub.getCall` methods, document `yieldsAsync` and `yieldsAsyncOnce`.
- 0.11.3 - remove dependency on mongoid, make stub work with node-v0.8 without setImmediate
- 0.11.2 - fix filepath resolution for _require, mockRequire and mockRequireStub, and throw if cannot find file
- 0.11.1 - stub internal reorg, implement getCall/yieldsAsync/yieldsAsyncOnce, cleanups
- 0.11.0 - treat as callback the first function (not the last arg),
           new: stub/spy methods yields(), returns(), throws(), yieldsOnce(), returnsOnce(), throwsOnce()
           new: stub/spy methods calledBefore(), calledAfter()
           fix: record actual callback arg not the internal callback spy
- 0.10.2 - fix unrequire() of ./ and ../ relative filepaths
- 0.10.1 - fix stubbing a method on a function
- 0.10.0 - save 3 results in stub(), always return a function from spy() and stub(), make restore() return the original func,
           make spied stats accessible on the returned spy itself in addition to spy.stub
- 0.9.3 - fix unrequire to tolerate corrupted require.cache vs module.children
- 0.9.2 - add `mockRequireStub`
- 0.9.0 - new `mockRequire()` functionality
- 0.8.0 - new `.on`, `.once` and `.default` mockHttpServer commands, make spy(func).restore() return func (not throw), upgrade to mongoid-1.1.3
- 0.7.0 - breaking: fix mockHttpServer buildUrl and .when to build and test the same url nodejs does.
          This means `uri.pathmame` is now ignored, which might break tests that depended on it.
- 0.6.6 - allow falsy timers to clearTimeout et al
- 0.6.5 - stub `req.setTimeout`, intercept `request` even when called as a bare function
- 0.6.4 - also test with node-v8, experimental server.throw action, match POST:, DEL: etc qualified urls or pathnames,
          stub req.sock.setTimeout, propagate uri.headers to req._headers
- 0.6.3 - set `stub.called` for sinon compat, fix getMock(Constructor), fix extendWithMocks().getMockSkipConstructor,
          fix mocks when have expects/method/check methods, fix QMock.expects() when mocked has expects() method
- 0.6.2 - fix extendWithMocks to export all mock methods
- 0.6.1 - readme updates
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

- the nodejs property getter/setter methods should make it possible for data
  properties to be mocked too, eg getMockValue(name).  with() could map to
  set, will() to get.
- introduce a havingReturned() method to be able to inspect not just the
  called with arguments but the method return value as well
- add returnCallback() method to return err, for callbacks not just direct returns
- clone un-enumerable properties as well, retaining their original definitions
- `inherit()` and `disinherit()` calls: annotate the prototype (inherited properties) of the object,
  for e.g. `x = 3; inherit(x, 'a', 1); assert(x.a === 1)`
- .when().timeout(ms) action to emulate a req timeout
- todo: publish req._mockWrites, useful for debugging
- todo: error out on write after end, to catch errors
- maybe: allow spy.onCall() to selectively stub only some calls
- fix: mockHttp should match default ports 80 and 443 whether or not explicitly included in url
- fix: mockHttp should not end the call if no actions have been specified
- fix: mockHttpServer should match routes with or without trailing `/`
- maybe: mockHttpServer should match only path, not query string params
