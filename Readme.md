QMock
=====

QMock is a light-weight test double library for easier testing of
dependency injection style code.  Mocks are lacking in nodeunit; having
used them in phpunit, I missed them.

QMock.getMock(master) returns a mock object that is instanceof master.
Master can be a class (constructor function) or an existing object.
The mock is a fully functional object, with some methods possibly stubbed out.

QMock is testing framework agnostic; mocks can be used standalone.  I tried
to integrate them into nodeunit, but that's still rough.

Installation
------------

        npm install qmock

Example
-------

        QMock = require('qmock');

        // mock an existing object
        var mock = QMock.getMock(console);

        // instrument log() and ensure that it is called with 'hello'
        // full phpunit syntax should also work, ie
        // mock.expects(QMock.twice()).method('log').with('hello');
        mock.expects(2).method('log').with('hello');
        mock.log('hello');
        QMock.check(mock);      // assertion error, called 1 times, expected 2

        // with() is sticky, all subsequent calls must also match
        mock.log('world');      // assertion error, 'world' !== 'hello'

        // methods don't have to already exist.  create and call a stub method
        // by specifying what it will return:
        mock.expects(1).method('boom').will(QMock.throwError(new Error("BOOM!")));
        mock.boom();            // error throw, BOOM!

Todo
----

- qmocks are awkward the way they hook into unit tests.  For nodeunit,
  QMock.extendWithMocks(test, 'done') will add a getMock() method to the currently
  running test and will check any created mocks for having met their expected
  assertions on test.done().  It would be nicer if tie-in were made once, not
  per test.

- the nodejs property getter/setter methods should make it possible for data
  properties to be mocked too, eg getMockValue(name).  with() could map to
  set, will() to get.

- introduce a havingReturned() method to be able to inspect not just the
  called with arguments but the method return value as well

- add returnCallback() method to return err, for callbacks not just direct returns
