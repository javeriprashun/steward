// +++ under development
// http://www.ti.com/ww/en/wireless_connectivity/sensortag/index.shtml?INTC=SensorTag&HQS=sensortag-bt1

var util        = require('util')
  , devices     = require('./../../core/device')
  , steward     = require('./../../core/steward')
  , utility     = require('./../../core/utility')
  , tricorder   = require('./../device-tricorder')
  ;


var levels = { none: 0x00, mild: 0x01, high: 0x02 };

var logger = tricorder.logger;


var SensorTag = exports.Device = function(deviceID, deviceUID, info) {
  var self = this;

  self.whatami = info.deviceType;
  self.deviceID = deviceID.toString();
  self.deviceUID = deviceUID;
  self.name = info.device.name;
  self.getName();

  self.status = 'present';
  self.peripheral = info.peripheral;
  self.ble = info.ble;
  self.info = {};

  self.peripheral.on('connect', function() {
    self.peripheral.updateRssi();
  });

  self.peripheral.on('disconnect', function() {
    self.status = 'idle';
    self.changed();

    logger.info('device/' + self.deviceID, { status: self.status });
// TBD: handle connection timeout...
    setTimeout(function() { self.status = 'absent'; self.changed(); self.peripheral.connect(); }, 120 * 1000);
  });
  self.peripheral.on('rssiUpdate', function(rssi) {
    self.status = 'present';
    self.info.rssi = rssi;
    self.changed();

    logger.info('device/' + self.deviceID, { status: self.status });
  });

  utility.broker.subscribe('actors', function(request, taskID, actor, perform, parameter) {
    if (request === 'ping') {
      logger.info('device/' + self.deviceID, { status: self.status });
      return;
    }

    if (actor !== ('device/' + self.deviceID)) return;
    else if (request === 'perform') self.perform(self, taskID, perform, parameter);
  });
};
util.inherits(SensorTag, tricorder.Device);


SensorTag.prototype.perform = function(self, taskID, perform, parameter) {
  var c, e, level, params;

  try { params = JSON.parse(parameter); } catch(ex) { params = {}; }

  if (perform === 'set') {
    if (!!params.name) return self.setName(params.name);
    return false;
  }
  if (perform !== 'alert') return false;

  level = levels[params.level] || 0x00;

  if (!self.ble['1802']) return;
  c = self.ble['1802'].characteristics;
  if (!c['2a06']) return;
  e = c['2a06'].endpoint;
  try {
    e.write(new Buffer([ level ]));
    setTimeout(function() { e.write(new Buffer([ 0x00 ])); }, 2000);
    steward.performed(taskID);
  } catch(ex) { logger.error('device/' + self.deviceID, { event: 'perform', diagnostic: ex.message }); }

  return true;
};

var validate_perform = function(perform, parameter) {
  var params = {}
    , result = { invalid: [], requires: [] };

  if ((perform !== 'set') && (perform !== 'alert')) result.invalid.push('perform');
  if (!parameter) {
    result.requires.push('parameter');
    return result;
  }
  try { params = JSON.parse(parameter); } catch(ex) { result.invalid.push('parameter'); }

  if (perform === 'set') {
    if (!params.name) result.requires.push('name');
  } else if (perform === 'alert') {
    if (!params.level) result.requires.push('level');
    else if (!levels[params.level]) result.invalid.push('level');
  }

  return result;
};


exports.start = function() {
  steward.actors.device.tricorder['texas-instruments'] = steward.actors.device.tricorder['texas-instruments'] ||
      { $info     : { type       : '/device/tricorder/texas-instruments' } };

  steward.actors.device.tricorder['texas-instruments'].sensortag =
      { $info     : { type       : '/device/tricorder/texas-instruments/sensortag'
                    , observe    : [ ]
                    , perform    : [ 'alert' ]
                    , properties : { name   : true
                                   , status : [ 'present', 'absent', 'idle' ]
                                   , rssi   : 's8'
                                   , level  : [ 'none', 'mild', 'high' ]
                                   }
                    }
      , $validate : {  perform   : validate_perform }
      };
  devices.makers['/device/tricorder/texas-instruments/sensortag'] = SensorTag;

  require('./../../discovery/discovery-ble').register(
    { 'Texas Instruments'       : { '2a00' : { 'TI BLE Sensor Tag' : { type : '/device/tricorder/texas-instruments/sensortag' }
                                             }
                                  }
    });
};
