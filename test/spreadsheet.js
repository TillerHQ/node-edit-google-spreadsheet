var chai = require('chai');
var sinon = require('sinon');
var sinonChai = require('sinon-chai');
chai.use(sinonChai);
var expect = chai.expect;
var mockery = require('mockery');
var fs = require('fs');
var path = require('path');

var mockRequestCbParams = {
  err: null,
  response: { statusCode: 200 },
  body: {}
};
var mockRequest = sinon.spy(function(opts, callback) {
  callback(
    mockRequestCbParams.err,
    mockRequestCbParams.response,
    mockRequestCbParams.body
  );
});

var mockAuth = sinon.spy(function(opts, callback) {
  if (mockRequestCbParams.response.statusCode == 401) {
    // we're authed now...
    mockRequestCbParams.response.statusCode = 200;
  }
  callback(null, 'mockToken');
});

var opts = {
  oauth2: 'oauth2',
  spreadsheetId: 'spreadsheetId',
  worksheetId: 'worksheetId'
};


var Spreadsheet;

describe('Spreadsheet', function() {
  before(function() {

    mockery.enable({warnOnUnregistered: false});

    mockery.registerMock('request', mockRequest);
    mockery.registerMock('./auth', mockAuth);

    Spreadsheet = require('../lib/spreadsheet.js');
  });
  after(function() {
    mockery.deregisterAll();
    mockery.disable();
  });

  describe('create (alias load)', function() {
    it('should call the callback', function() {
      var callback = sinon.spy();
      Spreadsheet.create({}, callback);
      expect(callback).to.have.been.calledOnce;
    });
    it('should call the opts.callback', function() {
      var callback = sinon.spy();
      Spreadsheet.create({callback: callback});
      expect(callback).to.have.been.calledOnce;
    });
    it('should throw an error if there is no callback', function() {
      expect(function() {
        Spreadsheet.create({});
      }).to.throw('Missing callback')
    });
    it('should return an error if there is no auth mechanism', function() {
      var errValue;
      var callback = sinon.spy(function(err) {errValue = err;});
      Spreadsheet.create({spreadsheetId: 'spreadsheetId', worksheetId: 'worksheetId'}, callback);
      expect(callback).to.have.been.calledOnce;
      expect(errValue).to.equal('Missing authentication information');
    });
    it('should return an error if there is no spreadsheet specified', function() {
      var errValue;
      var callback = sinon.spy(function(err) {errValue = err;});
      Spreadsheet.create({oauth2: 'oauth2', worksheetId: 'worksheetId'}, callback);
      expect(callback).to.have.been.calledOnce;
      expect(errValue).to.equal("Missing 'spreadsheetId' or 'spreadsheetName'");
    });
    it('should return an error if there is no worksheet specified', function() {
      var errValue;
      var callback = sinon.spy(function(err) {errValue = err;});
      Spreadsheet.create({oauth2: 'oauth2', spreadsheetId: 'spreadsheetId'}, callback);
      expect(callback).to.have.been.calledOnce;
      expect(errValue).to.equal("Missing 'worksheetId' or 'worksheetName'");
    });
    describe('when authing with defaults', function() {
      var authParams;
      before(function(done) {
        mockAuth.reset();
        Spreadsheet.create(opts, function() {
          authParams = mockAuth.args[0][0];
          done();
        });
      });
      it('should default to use cell text values', function() {
        expect(authParams.useCellTextValues).to.be.true;
      });
      it('should default to https', function() {
        expect(authParams.useHTTPS).to.equal('s');
      });
      it('should pass the specified parameters', function() {
        expect(authParams.oauth2).to.equal('oauth2');
        expect(authParams.spreadsheetId).to.equal('spreadsheetId');
        expect(authParams.worksheetId).to.equal('worksheetId');
      });
    });
    it('should be able to override use cell text values', function(done) {
      mockAuth.reset();
      var opts = {
        oauth2: 'oauth2',
        spreadsheetId: 'spreadsheetId',
        worksheetId: 'worksheetId',
        useCellTextValues: false
      };
      Spreadsheet.create(opts, function() {
        expect(mockAuth.args[0][0].useCellTextValues).to.be.false;
        done();
      });
    });
    it('should be able to override use HTTPS', function(done) {
      mockAuth.reset();
      var opts = {
        oauth2: 'oauth2',
        spreadsheetId: 'spreadsheetId',
        worksheetId: 'worksheetId',
        useHTTPS: false
      };
      Spreadsheet.create(opts, function() {
        expect(mockAuth.args[0][0].useHTTPS).to.be.empty;
        done();
      });
    });
    it('should pass back an initialized spreadsheet instance', function(done) {
      Spreadsheet.create(opts, function(err, spreadsheet) {
        expect(err).to.not.exist;
        expect(spreadsheet.spreadsheetId).to.equal('spreadsheetId');
        expect(spreadsheet.worksheetId).to.equal('worksheetId');
        expect(spreadsheet.protocol).to.equal('https');
        done();
      });
    });
  });

  describe('spreadsheet', function() {
    var spreadsheet;

    before(function(done) {
      Spreadsheet.create(opts, function(err, createdSheet) {
        spreadsheet = createdSheet;
        done();
      });
    });
    beforeEach(function() {
      mockRequestCbParams = {
        err: null,
        response: {
          statusCode: 200,
          headers: { 'content-type': 'application/atom+xml; charset=UTF-8; type=feed' }
        },
        body: '',
      };
    });

    describe('request', function() {
      var opts = {
        url: 'https://example.com'
      };

      it('should return an error if no URL is provided', function(done) {
        spreadsheet.request({}, function(err, response) {
          expect(err).to.equal('Invalid request');
          done();
        });
      });
      it('should return an error if the request fails (ie. timeout)', function(done) {
        mockRequestCbParams.err = new Error('ETIMEDOUT');
        spreadsheet.request(opts, function(err, response) {
          expect(err).to.be.an.instanceof(Error);
          done();
        });
      });
      it('should return an error if the server does not respond', function(done) {
        mockRequestCbParams.response = undefined;
        spreadsheet.request(opts, function(err, response) {
          expect(err).to.be.an.instanceof(Error);
          expect(err.message).to.equal('no response');
          done();
        });
      });
      it('should return an error if the server returns an error', function(done) {
        mockRequestCbParams.response.statusCode = 500;
        mockRequestCbParams.body = 'Something broke.';
        spreadsheet.request(opts, function(err, response) {
          expect(err).to.be.an.instanceof(Error);
          expect(err.message).to.exist;
          expect(err.code).to.equal(500);
          expect(err.body).to.equal('Something broke.');
          done();
        });
      });
      it('should return an error if the server an unknown content-type', function(done) {
        mockRequestCbParams.body = '<!DOCTYPE html>';
        mockRequestCbParams.response.headers['content-type'] = 'text/html';
        spreadsheet.request(opts, function(err, response) {
          expect(err).to.be.an.instanceof(Error);
          expect(err.message).to.equal('<!DOCTYPE html>');
          done();
        });
      });
      it('should reauth if the server returns a 401 (Unauthorized)', function(done) {
        mockAuth.reset();
        mockRequestCbParams.response.statusCode = 401;
        spreadsheet.request(opts, function(err, response) {
          expect(err).to.not.exist;
          expect(mockAuth).to.have.been.calledOnce;
          done();
        });
      });
      it('should parse text elements', function(done) {
        mockRequestCbParams.body = '<title>Income</title>';
        spreadsheet.request(opts, function(err, response) {
          expect(response.title).to.equal('Income');
          done();
        });
      });
      it('should coerce numeric integer elements', function(done) {
        mockRequestCbParams.body = '<gs:rowCount>45</gs:rowCount>';
        spreadsheet.request(opts, function(err, response) {
          expect(response['gs:rowCount']).to.equal(45);
          done();
        });
      });
      it('should coerce numeric floating elements', function(done) {
        mockRequestCbParams.body = "<gs:cell row='85' col='6' inputValue='=R[0]C[-1]/R[0]C[-2]' numericValue='1.2'>1.20</gs:cell>";
        spreadsheet.request(opts, function(err, response) {
          expect(response['gs:cell'].$t).to.equal(1.2);
          done();
        });
      });
      it('should parse text attributes', function(done) {
        mockRequestCbParams.body = "<batch:status code='200' reason='Success'/>";
        spreadsheet.request(opts, function(err, response) {
          expect(response['batch:status'].reason).to.equal('Success');
          done();
        });
      });
      it('should coerce numeric integer attributes', function(done) {
        mockRequestCbParams.body = "<batch:status code='200' reason='Success'/>";
        spreadsheet.request(opts, function(err, response) {
          expect(response['batch:status'].code).to.equal(200);
          expect(response['batch:status'].code).to.be.a('number');
          done();
        });
      });
      it('should coerce numeric float attributes', function(done) {
        mockRequestCbParams.body = "<gs:cell row='85' col='6' inputValue='=R[0]C[-1]/R[0]C[-2]' numericValue='1.2'>1.20</gs:cell>";
        spreadsheet.request(opts, function(err, response) {
          expect(response['gs:cell'].numericValue).to.equal(1.2);
          expect(response['gs:cell'].numericValue).to.be.a('number');
          done();
        });
      });
    });

    describe('receive', function() {

      var response = fs.readFileSync(path.join(__dirname, 'response.xml')).toString();
      var validateInfo = function(info) {
        expect(info.spreadsheetId).to.equal('spreadsheetId');
        expect(info.worksheetId).to.equal('worksheetId');
        expect(info.worksheetTitle).to.equal('Sheet1');
        expect(info.worksheetUpdated.toString()).to.equal(new Date('2006-11-17T18:27:32.543Z').toString());
        expect(info.authors).to.equal('Fitzwilliam Darcy');
        expect(info.totalCells).to.equal(3);
        expect(info.totalRows).to.equal(2);
        expect(info.lastRow).to.equal(9);
        expect(info.nextRow).to.equal(10);
      }

      beforeEach(function() {
        mockRequestCbParams.body = response;
      });

      describe('with only the callback', function() {
        it('should return the parsed data', function() {
          spreadsheet.receive(function(err, rows, info) {
            expect(err).to.not.exist;
            validateInfo(info);
            expect(rows[1][1]).to.equal('Name');
            expect(rows[1][2]).to.equal('Hours');
            expect(rows[9][4]).to.equal('=FLOOR(C9/(B9*60),.0001)');
          });
        });
      });
      describe('with the getValues option', function() {
        it('should return the value in lieu of the formula', function() {
          spreadsheet.receive({getValues: true}, function(err, rows, info) {
            expect(err).to.not.exist;
            validateInfo(info);
            expect(rows[9][4]).to.equal(5);
          });
        });
      });
      describe('with options and query parameters', function() {
        it('should pass the query parameters through to the request', function() {
          var qs = {
            'min-row': 2
          };
          mockRequest.reset();
          spreadsheet.receive({getValues: true}, qs, function(err, rows, info) {
            expect(err).to.not.exist;
            validateInfo(info);
            expect(mockRequest.args[0][0].qs).to.equal(qs);
          });
        });
      });
      describe('with no feed element in the response', function() {
        it('should return an error', function(done) {
          mockRequestCbParams.body = "<gs:cell row='85' col='6' inputValue='=R[0]C[-1]/R[0]C[-2]' numericValue='1.2'>1.20</gs:cell>";
          spreadsheet.receive(function(err, rows, info) {
            expect(err).to.be.an.instanceof(Error);
            expect(err.message).to.equal('Error Reading Spreadsheet');
            done();
          });
        });
      });
    });
  });
});
