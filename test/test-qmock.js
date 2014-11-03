QMock = require('../index');
assert = require('assert');

module.exports = {
    setUp: function(done) {
        this.templateClass = function() {
            return {
                a: 1,
                b: 2.34,
                c: null,
                d: false,
                e: { a:1 },
                f: function() { return 'e'; },
            };
        };
        this.templateObject = new this.templateClass();
        done();
    },

    tearDown: function(done) {
        done();
    },

    'QMock': {
        'should return a clone of the object': function(t) {
            var i;
            var obj = this.templateObject;
            var mock = QMock.getMock(obj, []);
            for (i in obj) {
                t.ok(obj[i] === mock[i]);
            }
            t.done();
        },

        'should return an instance of a mocked constructor': function(t) {
            var constructor = function() { this.a = 1; };
            var obj = new constructor();
            t.done();
        },

        'should suppress mocked methods': function(t) {
            var wasCalled = false;
            var obj = { m: function() { wasCalled = true; assert(false, "should not be called"); } };
            var mock = QMock.getMock(obj, ['m']);
            mock.m();
            t.equal(wasCalled, false);
            t.done();
        },

        'should override mocked methods': function(t) {
            var obj = { m: 1 };
            var mock = QMock.getMock(obj, ['m']);
            mock.m();
            t.done();
        },

        'should implement mocked methods': function(t) {
            var obj = { };
            var mock = QMock.getMock(obj, ['m']);
            mock.m();
            t.done();
        },

        'should decorate tester object': function(t) {
            var tester = {};
            QMock.extendWithMocks(tester);
            t.equal(typeof tester.getMock, 'function');
            t.equal(typeof tester.getMockSkipConstructor, 'function');
            t.equal(typeof tester.done, 'function');
            t.done();
        },

        'should not decorate tester twice': function(t) {
            var tester = QMock.extendWithMocks({});
            t.expect(1);
            try { QMock.extendWithMocks(tester); assert(false, "expected error"); }
            catch (err) { t.ok(true); };
            t.done();
        },
    },

    'getMock': {
        'should be instanceof constructor': function(t) {
            var ctor = function(){ };
            var obj = new ctor();
            t.ok(obj instanceof ctor);
            var mock = QMock.getMock(obj);
            t.ok(mock instanceof ctor, "mock not instanceof mocked");
            t.done();
        },

        'expects should return Expected object': function(t) {
            var expected = QMock.getMock({}).expects(0);
            t.equal(typeof expected, 'object');
            t.ok(!(expected instanceof QMock));
            t.done();
        },

        'expects should accept count words': function(t) {
            t.equal(0, QMock.getMock({}).expects('never').expectedCount);
            t.equal(1, QMock.getMock({}).expects('once').expectedCount);
            t.equal(2, QMock.getMock({}).expects('twice').expectedCount);
            t.equal(3, QMock.getMock({}).expects('thrice').expectedCount);
            t.equal(-1, QMock.getMock({}).expects('any').expectedCount);
            t.done();
        },

        'expects should accept exact count values': function(t) {
            var i;
            for (i=-1; i<20; i++) t.equal(i, QMock.getMock({}).expects(i).expectedCount);
            t.done();
        },

        'QMock should provide methods for count words': function(t) {
            t.equal(QMock.any(), -1);
            t.equal(QMock.never(), 0);
            t.equal(QMock.once(), 1);
            t.equal(QMock.twice(), 2);
            t.equal(QMock.thrice(), 3);
            t.equal(QMock.exactly(1234), 1234);
            t.done();
        },
    },

    'Expected': {
        'returnValue': {
            'should return scalars': function(t) {
                var ret, i, scalars = [123, 4.56, "seven", null, undefined];
                for (i in scalars) {
                    var mock = QMock.getMock({}, ['m']);
                    mock.expects(1).method('m').will(QMock.returnValue(scalars[i]));
                    ret = mock.m();
                    t.equal(ret, scalars[i]);
                }
                t.done();
            },
        },

        'should return argument': function(t) {
            var mock = QMock.getMock({}, ['m']);
            mock.expects(1).method('m').will(QMock.returnArgument(2));
            var ret = mock.m('a', 'b', 'c', 'd', 'e', 'f');
            t.ok(ret === 'c');
            t.done();
        },

        'should return self': function(t) {
            var mock = QMock.getMock({}, ['m']);
            mock.expects(1).method('m').will(QMock.returnSelf());
            var ret = mock.m();
            t.ok(mock === ret);
            t.done();
        },

        'should throw exception': function(t) {
            var mock = QMock.getMock({}, ['m']);
            mock.expects(1).method('m').will(QMock.throwException(new Error("error")));
            try { var ret = mock.m(); t.ok(false); }
            catch (err) { t.ok(true); }
            t.done();
        },

        'should call callback': function(t) {
            var wasCalled = false;
            var mock = QMock.getMock({}, ['m']);
            mock.expects(1).method('m').will(QMock.callCallback(function(){ wasCalled = true; }));
            mock.m();
            t.ok(wasCalled);
            t.done();
        },

        'should count calls': function(t) {
            var i, mock = QMock.getMock({}, ['test']);
            var expect = mock.expects(QMock.any()).method('test');
            for (i=0; i<20; i++) mock.test();
            t.equal(expect.callCount, 20);
            t.done();
        },

        'should return values onConsecutiveValues': function(t) {
            var mock = QMock.getMock({ m: function() { return 123; } });
            mock.expects(3).method('m').will(QMock.onConsecutiveCalls(1, 2, 3));
            t.equal(mock.m(), 1);
            t.equal(mock.m(), 2);
            t.equal(mock.m(), 3);
            t.equal(mock.m(), undefined);
            t.done();
        },
    },
};
