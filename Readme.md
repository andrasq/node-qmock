QMock
=====

QMock is a light-weight test double library for easy testing of
dependency injection style code.  Mocks are lacking in nodeunit, having
used them in phpunit, I missed them.

QMock.getMock(master) returns a mock object that is instanceof master.
Master can be a class (constructor function) or an existing object.
The mock is a fully functional clone, with some methods possibly stubbed out.

QMock is testing framework agnostic; mocks can be used standalone.  I tried
to integrate them into nodeunit, but that's still rough.

Installation
------------

        npm install qmock

Example
-------

        QMock = require('qmock');
        var mock = QMock.getMock(console);

        // instrument log() and ensure that it is called with 'hello'
        mock.expects(1).method('log').with('hello');
        mock.log('hello');
        mock.log('world');
        mock.check();           // assertion error, 'world' !== 'hello'
        // note that the syntax is looser than phpunit, but phpunit syntax is accepted too:
        // mock.expects(QMock.once()).method('log').with('hello').will(QMock.returnValue(42));

        // methods don't have to already exist.  create and call a stub method
        // by specifying what it will return:
        mock.expects(1).method('boom').will(QMock.throwError(new Error("BOOM!")));
        mock.boom();            // error throw, BOOM!

TODO
----

- qmocks are awkward the way they hook into unit tests.  For nodeunit, QMock.extendWithMocks(test, 'done')
  will add a getMock() to the currently running test and will check any created for having met their
  expected assertions on test.done().  It would be nicer if tie-in were made once, not per test.

- the nodejs property getter/setter methods should allow data properties to be mocked too,
  eg getMockValue(name).  with() could map to set, will() to get.
