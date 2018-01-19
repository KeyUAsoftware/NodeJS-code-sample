/*
 * Manages the cache in Redis
 */

const redis = global.LOCAL_REDIS ? require('fakeredis') : require('redis');
const moment = require('moment');
const async = require('async');
const _ = require('lodash');
const events = require('events');
const logger = require('../common/logger.js');
const dynamoDb = require('../awsComponents/dynamoDBProvider.js');
const dbHelper = require('../awsComponents/dynamoDBProviderHelper.js');
const customLib = require('../masterData/customer.js');
const relationHelper = require('../common/relationHelper');
const constants = require('../common/constants.js');

// Entry prefix & suffixes
const CUSTOMER = 0;
const SUFFIX_LASTENTRY = '.LAST_ENTRY';
const SUFFIX_PREVIOUSENTRY = '.PREVIOUS_ENTRY';
const SUFFIX_ALARM_EVAL = '.ALARM_EVAL_LAST_TIME';
const SUFFIX_ALARM_EXEC = '.ALARM_EXEC_LAST_TIME';
const SUFFIX_LAST_ALARM = '.LAST_TIME_ALARM';
const SUFFIX_LAST_CONDITION = '.ALARM_LAST_CONDITION';
const SUFFIX_VALUETYPE = '.VALUE_TYPE';
const SUFFIX_ATHENA_SEMAPHORE = '.ATHENA_SEMAPHORE';
const SUFFIX_SOLUTION_DESIGN_LOCK = '.SOLUTION_DESIGN_LOCK';

const redisClient = redis.createClient(process.env.REDIS_PORT, process.env.REDIS_URL);
const eventEmitter = new events.EventEmitter();

// Check if redis is running
redisClient.on('error', function (err) {
	logger.info('awsComponents.cache: Warning: Redis is not running. All data is gotten from dynamoDB.');
	logger.error(err);
	eventEmitter.emit('rediserror');
});
redisClient.on('ready', function () {
	logger.info('awsComponents.cache: Log: Redis is running properly.');
	eventEmitter.emit('redisready');
});


function getCachedByCustomer(customer, callback) {
	const key = `${CUSTOMER}.${customer}`;
	let value;

	function reload(err) {
		if (err) return callback(logger.error(err));
		customLib.getCustomerInfoFromDB(customer, gotDB);
	}

	function checkCached(err, old) {
		if (err) return callback(logger.error(err));
		if (old) return redisClient.del(key, reload);
		callback(null, value);
	}

	function gotDB(err, data) {
		if (err) return callback(logger.error(err));
		if (data) {
			value = data;
			redisClient.getset(key, JSON.stringify(data), checkCached);
		}
	}

	function gotCached(err, data) {
		if (err) return callback(logger.error(err));
		if (data) return callback(null, JSON.parse(data));
		customLib.getCustomerInfoFromDB(customer, gotDB);
	}

	if (!redisClient.ready) customLib.getCustomerInfoFromDB(customer, callback);
	else redisClient.get(key, gotCached);
};

function getBucket(customer, callback) {
	getCachedByCustomer(customer, (err, item) => {
		if (err) return callback(logger.error(err));
		if (item) return callback(null, item.BUSINESS_INFO.FILE_BUCKET);
		callback(new Error(`masterData.customer.getBucket: No customer for ${customer}`));
	});
};

/**
 * Entity getters (by ID+type or beID) - entity JSON is kept in redis under two keys: beId and customer.ID.type
 */
function getKeyCacheForEntity(customerName, entity, type) {
	return `${customerName}.${entity}.${type}`;
};

/**
 * Return entity object from redis, if not found tries to get it from DynamoDB, if not found returns undefined
 * @param  {string}   customer Customer ID
 * @param  {string}   entity   Entity ID
 * @param  {number}   type     Entity type
 * @param  {Function} callback
 */
function getCachedByEntity(customer, entity, type, callback) {
	const key = getKeyCacheForEntity(customer, entity, type);
	let value;

	function reload(err) {
		if (err) return callback(logger.error(err));
		dynamoDb.getEntityInfoByType(customer, entity, type, gotDB);
	}

	function checkCached(err, old) {
		if (err) return callback(logger.error(err));
		if (old) return redisClient.del(key, reload);
		callback(null, value);
	}

	function gotDB(err, data) {
		if (err) return callback(logger.error(err));
		value = data;
		redisClient.getset(key, data ? JSON.stringify(data) : constants.DOESNT_EXIST_KEY, checkCached);
	}

	function gotCached(err, data) {
		if (err) return callback(logger.error(err));
		if (data) {
			if (data === constants.DOESNT_EXIST_KEY) return callback(null, undefined);
			callback(null, JSON.parse(data));
		}
		dynamoDb.getEntityInfoByType(customer, entity, type, gotDB);
	}

	if (!redisClient.ready) dynamoDb.getEntityInfoByType(customer, entity, type, callback);
	else redisClient.get(key, gotCached);
}


/**
 * Return entity object from redis
 * @param  {string}   cases      Combination of all possible cases
 * @param  {string}   customer Customer ID
 * @param  {number}   type     Entity type
 * @param  {Function} callback
 */
function getCaseInsensitiveKeys(cases, customer, type, callback) {
	const key = getKeyCacheForEntity(customer, cases, type);
	redisClient.keys(key, (err, keys) => {
		if (err) {
			logger.error(err);
			callback(null, []);
		} else callback(null, keys);
	});
}

function getCachedByBeID(beID, callback) {
	let value;

	function reload(err) {
		if (err) return callback(logger.error(err));
		dynamoDb.getEntityInfoFromBeID(beID, gotDB);
	}

	function checkCached(err, old) {
		if (err) return callback(logger.error(err));
		if (old) return redisClient.del(beID, reload);
		callback(null, value);
	}

	function gotDB(err, data) {
		if (err) return callback(logger.error(err));
		if (data) {
			value = data;
			redisClient.getset(beID, JSON.stringify(data), checkCached);
		} else callback();
	}

	function gotCachedByBeID(err, data) {
		if (err) return callback(logger.error(err));
		if (data) return callback(null, JSON.parse(data));
		dynamoDb.getEntityInfoFromBeID(beID, gotDB);
	}

	if (!redisClient.ready) dynamoDb.getEntityInfoFromBeID(beID, callback);
	else redisClient.get(beID, gotCachedByBeID);
};

/**
 * Returns true if entity has data
 * @param  {string}   customerID
 * @param  {string}   beID
 * @param  {Function} callback
 * @return {Boolean}             - has Data
 */
function hasDataByBeID(customerID, beID, callback) {
	let key = relationHelper.getValueKey(beID);
	getCachedByEntity(customerID, key, dynamoDb.TYPE_RELATIONSHIP, (err, data) => {
		if (err) return callback(logger.error(err), null);
		callback(null, data ? true : false);
	});
}
/**
 * Returns true if entity has data
 * @param  {string}   customerID
 * @param  {string}   entityID
 * @param  {number}   entityType
 * @param  {Function} callback
 * @return {Boolean}             - has Data
 */
function hasDataByEntity(customerID, entityID, entityType, callback) {
	getCachedByEntity(customerID, entityID, entityType, function (err, entity) {
		if (err) return callback(err);
		if (!entity) return callback(null, undefined);
		hasDataByBeID(customerID, entity.beID, callback);
	});
}

/**
 * Get agents related with a provided beID for customer
 * @param  {string}   customerID - Customer
 * @param  {string}   beID       - Identifier
 * @param  {Function} callback   - the callback that handles the response
 */
function getAgentsByBeID(customerID, beID, callback) {
	const key = relationHelper.getAgentKey(beID);
	getRelationshipParentEntitiesByBeID(customerID, key, callback);
}

/** Get value association parent entities  for given beID */
function getValueAssociationEntitiesByBeID(customerID, beID, callback) {
	const key = relationHelper.getVAChildKey(beID);
	getRelationshipParentEntitiesByBeID(customerID, key, callback);
}

/** Get parent entities from given relationship key */
function getRelationshipParentEntitiesByBeID(customerID, key, callback) {
	getCachedByEntity(customerID, key, dynamoDb.TYPE_RELATIONSHIP, (err, data) => {
		if (err) return callback(logger.error(err), null);
		if (!data) return  callback(null, []);
		async.map(data.CHILD, (entity, asyncCallback) => {
			getCachedByEntity(customerID, entity.ID, entity.TYPE, asyncCallback);
		}, callback);
	});
}

/**
 * Saves a record that has been last/previously saved in BF_VALUES to the cache
 *
 * @param {string}   customer     - customer
 * @param {string}   beID         - identifier
 * @param {number}   timestamp    - value timestamp
 * @param {object}   value        - value
 * @param {Function} callback     - callback that handles the response
 */
function setLastEntryForBeID(customer, beID, timestamp, value, callback) {
	setValueEntry(getKeyLastEntryCacheForBeID(customer, beID), timestamp, value, callback);
}

function getLastEntryForBeID(customer, beID, callback) {
	getValueEntry(getKeyLastEntryCacheForBeID(customer, beID), callback);
}

function setPreviousEntryForBeID(customer, beID, timestamp, value, callback) {
	setValueEntry(getKeyPreviousEntryCacheForBeID(customer, beID), timestamp, value, callback);
}

function getPreviousEntryForBeID(customer, beID, callback) {
	getValueEntry(getKeyPreviousEntryCacheForBeID(customer, beID), callback);
}


/** Cache keys for the latest/previous values saved in BF_VALUES associated to a beID */
function getKeyLastEntryCacheForBeID(customerName, beID) {
	return `${customerName}.${beID}${SUFFIX_LASTENTRY}`;
}

function getKeyPreviousEntryCacheForBeID(customerName, beID) {
	return `${customerName}.${beID}${SUFFIX_PREVIOUSENTRY}`;
}

function getKeyAthenaSemaphore(customerName) {
	return `${customerName}${SUFFIX_ATHENA_SEMAPHORE}`;
}

function setValueEntry(key, timestamp, value, callback) {
	if (redisClient.ready) {
		let last = {
			t: timestamp,
			v: value
		};
		setValueEntryImpl(key, last, (err, old) => {
			if (err) return callback(logger.error(err));
			callback(null, old === undefined ? undefined : old.t !== last.t ? old : null);
		});
	}
	else callback(new Error(`Redis not running - cannot set ${key}`));
}

function setValueEntryImpl(key, last, callback) {
	redisClient.getset(key, JSON.stringify(last), (err, data) => {
		if (err) return callback(logger.error(err));

		const old = data ? JSON.parse(data) : undefined;
		if (old === undefined || old.t <= last.t) return callback(null, old);
		setValueEntryImpl(key, old, callback);
	});
}

function getValueEntry(key, callback) {
	if (redisClient.ready){
		redisClient.get(key, (err, data) => {
			if (err) return callback(logger.error(err));
			callback(null, data ? JSON.parse(data) : undefined);
		});
	}
	else callback(new Error(`Redis not running - cannot get value for ${key}`));
}

function getAllLastValues(customer, globalcallback) {
	const searchKey = getKeyLastEntryCacheForBeID(customer, '*');

	redisClient.keys(searchKey, (err, keys) => {
		if (err) return globalcallback(err);
		async.map(keys, (key, callback) => {
			getValueEntry(key, (getValueEntryerr, data) => {
				if (getValueEntryerr) callback(getValueEntryerr);
				else {
					const beID = key.split('.')[1];
					callback(null, {
						beID,
						timeStamp: data.t,
						value: data.v,
					});
				}
			});
		}, (maperr, data) => {
			if (maperr) globalcallback(maperr);
			async.map(data, (value, callback) => {
				getCachedByBeID(value.beID, (cacheerr, entity) => {
					if (cacheerr) callback(cacheerr);
					else {
						value.entity = entity;
						callback(null, value);
					}
				})
			}, globalcallback);
		});
	});
}

function getAllRelations(customer, globalcallback) {
	const searchKey = `${customer}.*.${constants.TYPE_RELATIONSHIP}`;
	const removeKeys = ['.EMAIL.', '.SOLUTION_EXECUTION.', '.SOLUTION.', '.VALUE.', '.PROFILE.',
		'.CUSTOM_TAG.', '.BEDATAFEEDER.', '.ISA_TAG.', '.VA.PARENT'
	];
	async.waterfall([
		(callback) => {
			redisClient.keys(searchKey, (err, keys) => {
				if (err) callback(err);
				else {
					const relationKeys = _.filter(keys, (key) => {
						let keep = true;
						removeKeys.forEach((removeKey) => {
							if (key.indexOf(removeKey) >= 0) {
								keep = false;
							}
						});
						return keep;
					});
					callback(null, relationKeys);
				}
			});
		}, (filteredKeys, filteredCallback) => {
			async.map(filteredKeys, (key, callback) => {
				const keyArray = key.split('.').reverse();

				if (keyArray.length > 3) {
					let [, beID, relationType] = keyArray;
					if (relationType === 'CHILD') {
						relationType = 'VALUE_ASSOCIATION';
					}
					getCachedByBeID(beID, (err, entity) => {
						if (err) callback(err);
						else {
							if (entity && entity.TYPE) {
								callback(null, {
									relationType,
									entityType: entity.TYPE
								});
							} else callback(null, false);
						}
					});
				} else callback(null, false);
			}, filteredCallback);
		}, (relations, callback) => {
			const groupBy = _.groupBy(relations, (relation) => {
				if (relation) return relation.relationType;
				return false;
			});

			if (groupBy.false) delete groupBy.false;
			const result = {};
			_.forEach(groupBy, (value, key) => {
				result[key] = _.groupBy(value, (x) => {
					if (x) return x.entityType;
					return false;
				});
				_.forEach(result[key], (entityArray, entityTypeKey) => {
					result[key][entityTypeKey] = entityArray.length;
				});
			});
			callback(null, result);
		}
	], globalcallback);
}

/** Last alarm evaluation/execution time (epoch) */
function setAlarmEvalLastTime(customer, beId, agentID, alarmID, time, callback) {
	setAlarmLastTime(SUFFIX_ALARM_EVAL, customer, beId, agentID, alarmID, time, callback);
}

function setAlarmExecLastTime(customer, beId, agentID, alarmID, time, callback) {
	setAlarmLastTime(SUFFIX_ALARM_EXEC, customer, beId, agentID, alarmID, time, callback);
}

function setAlarmLastAlarm(customer, agentID, alarmID, time, callback) {
	setAlarmLastTime(SUFFIX_LAST_ALARM, customer, null, agentID, alarmID, time, callback);
}

function setAlarmLastTime(suffix, customer, beId, agentID, alarmID, time, callback) {
	const key = getKeyAlarmLastTime(suffix, customer, beId, agentID, alarmID);
	if (redisClient.ready) {
		setAlarmLastTimeImpl(key, time, (err, recorded) => {
			if (err) callback(logger.error(err));
			else callback(null, time === recorded);
		});
	}
	else callback(new Error(`Redis not running - cannot set ${key}`));
}

function setAlarmLastTimeImpl(key, time, callback) {
	redisClient.getset(key, time, (err, data) => {
		if (err) return callback(logger.error(err));

		const old = data ? parseInt(data) : undefined;
		if (old && old > time) return setAlarmLastTimeImpl(key, old, callback);
		callback(null, time);
	});
}

function getAlarmEvalLastTime(customer, beId, agentID, alarmID, callback) {
	getAlarmLastTime(SUFFIX_ALARM_EVAL, customer, beId, agentID, alarmID, callback);
}

function getAlarmExecLastTime(customer, beId, agentID, alarmID, callback) {
	getAlarmLastTime(SUFFIX_ALARM_EXEC, customer, beId, agentID, alarmID, callback);
}

function getAlarmLastTime(suffix, customer, beId, agentID, alarmID, callback) {
	const key = getKeyAlarmLastTime(suffix, customer, beId, agentID, alarmID);
	if (redisClient.ready) redisClient.get(key, function (err, data) {
		if (err) callback(logger.error(err));
		else callback(null, data ? parseInt(data) : undefined);
	});
	else callback(new Error(`Redis not running - cannot get value for ${key}`));
}

function getKeyAlarmLastTime(suffix, customer, beId, agentID, alarmID) {
	return beId ?
		`${customer}.${beId}.${agentID}.${alarmID}${suffix}` :
		`${customer}.${agentID}.${alarmID}${suffix}`
}

/** Cache keys for last executed alarm condition result */
function setAlarmLastCondition(customer, beId, agentID, alarmID, conditionResult, callback) {
	const key = getKeyAlarmLastCondition(customer, beId, agentID, alarmID);

	if (redisClient.ready) {
		redisClient.set(key, JSON.stringify(conditionResult), function (err) {
			if (err) callback(logger.error(err));
			else callback();
		});
	}
	else callback(new Error(`Redis not running - cannot set value for ${key}`));
}

function getAlarmLastCondition(customer, beId, agentID, alarmID, callback) {
	const key = getKeyAlarmLastCondition(customer, beId, agentID, alarmID);
	if (redisClient.ready) {
		redisClient.get(key, (err, data) => {
			if (err) callback(logger.error(err));
			else callback(null, data ? JSON.parse(data) : undefined);
		});
	}
	else callback(new Error(`Redis not running - cannot get value for ${key}`));
}

function getKeyAlarmLastCondition(customer, beId, agentID, alarmID) {
	return `${customer}.${beId}.${agentID}.${alarmID}${SUFFIX_LAST_CONDITION}`
}

/**
 * Returns alarms information (entityType,triggered & geo location) in the last hour
 * @param {string} customer
 */
function getAlarmsInfo(customer, secondsAgo, globalcallback) {
	const searchKey = `${customer}.*${SUFFIX_LAST_CONDITION}`;

	if (redisClient.ready) {
		async.waterfall([
			(callback) => {
				redisClient.keys(searchKey, callback);
			}, (keys, callback) => {
				const alarms = keys.map((key) => {
					const keyArr = key.split('.');
					return {
						beID: keyArr[1],
						key
					};
				});
				async.map(alarms, (alarm, entityCallback) => {
					getCachedByBeID(alarm.beID, (err, entity) => {
						const data = alarm;
						data.entity = entity;
						entityCallback(err, data);
					});
				}, callback);
			}, (alarms, callback) => {
				async.map(alarms, (alarm, alarmCallback) => {
					redisClient.get(alarm.key, (err, alarmInfo) => {
						try {
							const data = alarm;
							data.alarmInfo = JSON.parse(alarmInfo);
							alarmCallback(err, data);
						} catch (e) {
							alarmCallback();
						}
					});
				}, callback);
			}, (alarms, callback) => {
				const result = alarms.map((alarm) => {
					if (moment.duration(moment().diff(alarm.alarmInfo.t)).asSeconds() <= 3600) {
						return {
							GEO_LOCATION: alarm.entity.GEO_LOCATION,
							ID: alarm.entity.ID,
							TYPE: alarm.entity.TYPE,
							TRIGGERED: alarm.alarmInfo.r,
							VALUE: alarm.alarmInfo.v,
						};
					}
					return undefined;
				}).filter(item => item !== undefined);
				callback(null, result);
			}
		], globalcallback);
	}
	else globalcallback(`Can't connect to redis`, null);
}
/** Cache keys for data-input health checking */
function setEntityKeepAlive(suffix, customer, group, time, callback) {
	const key = getKeyEntityKeepAlive(suffix, customer, group);

	if (redisClient.ready) {
		setEntityKeepAliveImpl(key, time, function (err, recorded) {
			if (err) callback(logger.error(err));
			else callback(null, time === recorded);
		});
	}
	else callback(new Error(`Redis not running - cannot set ${key}`));
}

function setEntityKeepAliveImpl(key, time, callback) {
	redisClient.getset(key, time, (err, data) => {
		if (err) return callback(logger.error(err));

		const old = data ? parseInt(data) : undefined;
		if (old && old > time) return setEntityKeepAliveImpl(key, old, callback);
		callback(null, time);
	});
}

function getEntityKeepAliveLastTime(suffix, customer, group, callback) {
	const key = getKeyEntityKeepAlive(suffix, customer, group);

	if (redisClient.ready){
		redisClient.get(key, (err, data) => {
			if (err) callback(logger.error(err));
			else callback(null, data ? parseInt(data) : undefined);
		});
	}
	else callback(new Error(`Redis not running - cannot get value for ${key}`));
}

function getKeyEntityKeepAlive(suffix, customer, group) {
	return `${customer}.${group}.${suffix}`;
}

function getCachedFirstTimeStamp(customer, beID, callback) {
	if (!redisClient.ready) return dynamoDb.getFirstDateRegisteredByBeID(customer, beID, callback);

	redisClient.get(createFirstDateEntrykey(customer, beID), (error, value) => {
		if (error) callback(error, null);
		else if (!value || value === "null") {
			logger.info('getCachedFirstTimeStamp: trying to get first date from dynamoDB');
			dynamoDb.getFirstDateRegisteredByBeID(customer, beID, (error, firstDate) => {
				if (error) {
					logger.error(`getCachedFirstTimeStamp: ${error}`);
					callback(error, null);
				} else {
					logger.info(`getCachedFirstTimeStamp: ${firstDate}`);
					redisClient.getset(createFirstDateEntrykey(customer, beID), firstDate);
				}
				callback(null, firstDate);
			});
		}
		else callback(null, value);
	});
}

function createFirstDateEntrykey(customer, beID) {
	return `${customer}.${beID}.FIRST_TIMESTAMP`;
}

/** Calculates the key cache for a given value type associated to a beID */
function getKeyValueTypeCacheForBeID(customerName, beID) {
	return `${customerName}.${beID}${SUFFIX_VALUETYPE}`;
};

/** Extracts the valueType (beID) from a keyValueType stored in Redis */
function getBeIDFromKeyValueType(customerName, keyValueType) {
	const startPoint = customerName.length + 1;
	const endPoint = keyValueType.indexOf(SUFFIX_VALUETYPE);
	const result = keyValueType.substring(startPoint, endPoint);
	return result;
};

/** Get the beID for a known entity, checking first in the cache */
function entityMustBeNotified(customer, id, type, callback) {
	getCachedByEntity(customer, id, type, (err, item) => {
		if (err) {
			logger.error(err);
			return callback(err, null);
		}
		if (!item) {
			const err = `awsComponents.cache.entityMustBeNotified: No data for '${id}' and type '${type}'`;
			logger.error(err);
			return callback(err, null);
		}
		else callback(null, item.NOTIFY_ACK);
	});
};

/** Get the beID for a known entity, checking first in the cache */
function getEntityBeID(customer, id, type, callback) {
	getCachedByEntity(customer, id, type, (err, item) => {
		if (err) {
			logger.error(err);
			return callback(err, null);
		}
		if (!item) {
			const err = `awsComponents.cache.getEntityBeID: No data for '${id}' and type '${type}'`;
			logger.error(err);
			return callback(err, null);
		}
		else callback(null, item.beID);
	});
};

/** Get the data type property for a known entity, checking first in the cache */
function getEntityDataType(customer, id, type, callback) {
	getCachedByEntity(customer, id, type, function (err, item) {
		if (err) {
			logger.error(err);
			return callback(err, null);
		}
		if (!item) {
			const err = `awsComponents.cache.getEntityDataType: No data for '${id}' and type '${type}'`;
			logger.error(err);
			return callback(err, null);
		}
		else callback(null, item.DATA_TYPE);
	});
};

/** Get the data type property for a known entity beID, checking first in the cache. There is 2 different ways about it could be saved in Redis:
 */
function getEntityDataTypeByBeID(beID, callback) {
	getCachedByBeID(beID, function (err, item) {
		if (err) {
			logger.error(err);
			return callback(err, null);
		}
		if (!item) {
			const err = `awsComponents.cache.getEntityDataTypeByBeID: Error. No data for '${beID}'`;
			logger.error(err);
			return callback(err, null);
		}

		const entity = item.ENTITY_NAME;
		if (entity !== undefined) {
			const customer = item.ID_CUSTOMER;
			const entityID = entity.ID;
			const entityType = entity.TYPE;
			getEntityDataType(customer, entityID, entityType, (error, dataType) => {
				if (error) {
					logger.error(error);
					return callback(error, null);
				}
				callback(null, dataType);
			});
		} else {
			const dataType = item.DATA_TYPE;
			if (!dataType) {
				const err = `awsComponents.cache.getEntityDataTypeByBeID:Error for beID. There is not entity for '${beID}' item: ${JSON.stringify(item)}`;
				logger.error(err);
				return callback(err, null);
			}
			else callback(null, dataType);
		}
	});
};

/**
 * Sets a key and value in the cache
 * @param {[type]}   key      [description]
 * @param {[type]}   value    [description]
 * @param {Function} callback [description]
 */
function setCache(key, value, callback) {
	if (!redisClient.ready) return callback(`Error saving value for ${key}`, null);
	redisClient.getset(key, value, callback);

};

function setCacheNotReady(key, value, callback) {
	redisClient.getset(key, value, callback);
};
/**
 * Deletes a key in cache
 * @param  {[type]}   key      [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
 */
function delCache(key, callback) {
	if (redisClient.ready) return callback(`Error deleting ${key}`, null);
	redisClient.del(key, callback);

}

function delCacheNotReady(key, callback) {
	redisClient.del(key, callback);
}
/**
 * Deletes cached entity
 * @param  {string}   customerID
 * @param  {string}   entityID
 * @param  {number}   entityType
 * @param  {Function} callback
 */
function delCacheByEntity(customerID, entityID, entityType, callback) {
	const key = getKeyCacheForEntity(customerID, entityID, entityType);
	delCache(key, callback);
}

function removePredictionModelFromCache(customer, id, callback) {
	const key = `${customer}.${id}.${constants.TYPE_PREDICTION_MODEL}`;
	const errMessage ='Error removing prediction model from cache: ';

	if (redisClient.ready) {
		redisClient.get(key, (err, result) => {
			if (result) {
				const resultParse = JSON.parse(result);
				const beid = resultParse.beID;

				redisClient.del(key, (err, data) => {
					if (err) return callback(`${errMessage}${key}`);
					redisClient.del(beid, (err, data) => {
						if (err) return callback(`${errMessage}${beid}`);
						callback(null, data);
					});
				});
			} else callback(null, 'No result in redis');
		});
	}
	else callback(`${errMessage}${key}`);
}

/**
 * Removes an entity from cache
 * @param  {string}     customer      - customer ID
 * @param  {string}     id            - entity ID
 * @param  {string}     entityType    - entityType
 * @param  {string}     beID          - beID from entity
 * @return {object}     true if succeed - error if not
 * @memberof module:awsComponents/cache
 */
function removeEntityFromCache(customer, id, entityType, beID, globalCallback) {
	let asyncTasks = [];
	const key = `${customer}.${id}.${entityType}`;

	if (redisClient.ready) {
		asyncTasks.push((callback) => {
			redisClient.del(beID, (err, data) => {
				if (err) callback(`Error removing entity from cache: ${beID}`, null);
				else callback(null, data);
			});
		});

		asyncTasks.push((callback) => {
			redisClient.del(key, (err, data) => {
				if (err) callback(`Error removing entity from cache: ${key}`, null);
				else callback(null, data);
			});
		});

		async.parallel(asyncTasks, (err, data) => {
			const sumArr= data.reduce((previousValue, currentValue) => {
				return previousValue + currentValue;
			});

			if (err) return globalCallback(err, null);
			if(sumArr === 0) return globalCallback(null, false);
			globalCallback(null, true);
		});
	}
	else globalCallback(`Error removing entity from cache: ${key}`, null);
}

/**
 * Returns an array with the directly related entities by model
 * @param  {string}   customerID  - customer ID
 * @param  {string}   entityID    - entity ID
 * @param  {number}   entityType  - entity Type
 * @param  {Function} callback    - callback(error, arrayOfRelatedEntities)
 */
function getImmediateRelatedEntities(customerID, entityID, entityType, callback) {
	getCachedByEntity(customerID, entityID, entityType, (err, entity) => {
		if (err) return callback(logger.error(err));
		if (!entity) callback(null, null);
		else getImmediateRelatedEntitiesByBeID(customerID, entity.beID, callback);
	});

}

function getImmediateRelatedEntitiesByBeID(customerID, beID, globalcallback) {
	const keys = relationHelper.getAllRelationsKeys(beID);

	async.map(keys, (key, callback) => {
		getCachedByEntity(customerID, key, dynamoDb.TYPE_RELATIONSHIP, (err, entity) => {
			callback(err, entity);
		})
	}, (err, result) => {
		let relations = [];
		if (err) return globalcallback(logger.error(err));
		if (result) {
			for (let entity of result) {
				if (entity && entity.CHILD) {
					for (let item of entity.CHILD) {
						if (_.findIndex(relations, item) < 0) {
							relations.push(item)
						}
					}
				}
			}
		}
		globalcallback(null, relations);
	});
}
/**
 * Returns an array with all the related entities by model
 * @param  {string}   customerID      - customer ID
 * @param  {string}   entityID        - entity ID
 * @param  {number}   entityType      - entity Type
 * @param  {Function} globalcallback  - callback(error, arrayOfRelatedEntities)
 */
function getAllRelatedEntities(customerID, entityID, entityType, globalcallback) {
	getCachedByEntity(customerID, entityID, entityType, (err, entity) => {
		if (entity) {
			getImmediateRelatedEntitiesByBeID(customerID, entity.beID, (err, relatedEntities) => {
				async.map(relatedEntities, (relatedEntity, callback) => {
					getCachedByEntity(customerID, relatedEntity.ID, relatedEntity.TYPE, (err, entity) => {
						callback(err, entity);
					})
				}, (err, result) => {
					async.map(result, (parentEntity, callback) => {
						relationHelper.getNotInmediateRelationsForEntity(customerID, entity, parentEntity, callback)
					}, (err, relatedEntities) => {
						_.remove(relatedEntities, {
							ID: entityID,
							TYPE: entityType
						});
						globalcallback(err, _.uniqWith(_.flatten(relatedEntities), _.isEqual));
					})
				});
			});
		}
		else globalcallback(null, undefined)
	})
}
/**
 * Return array with the related entities to a ISA tag
 * @param  {string} customerID [description]
 * @param  {string} tag        [description]
 * @param  {Function} callback   - callback(error, arrayOfRelatedEntities)
 * @return [array]              ```[{ID,TYPE,beID}]```
 */
function getAllEntitiesForISATag(customerID, tag, callback) {
	const key = relationHelper.getISATagKey(tag);
	getCachedByEntity(customerID, key, dynamoDb.TYPE_RELATIONSHIP, (err, entity) => {
		if (err || !entity) return callback(err, []);
		callback(null, entity.CHILD);
	});
}

/**
 * Return array with the related entities to a Custom tag
 * @param  {string} customerID [description]
 * @param  {string} tag        [description]
 * @param  {Function} callback   - callback(error, arrayOfRelatedEntities)
 * @return [array]              ```[{ID,TYPE,beID}]```
 */
function getAllEntitiesForCustomTag(customerID, tag, callback) {
	const key = relationHelper.getCustomTagKey(tag);
	getCachedByEntity(customerID, key, dynamoDb.TYPE_RELATIONSHIP, (err, entity) => {
		if (err) return callback(err, []);
		callback(null, entity ? entity.CHILD : []);
	});
}

/**
 * Returns an array with the related agents
 * @param  {string}   customerID
 * @param  {string}   entityName
 * @param  {string}   entityType
 * @param  {Function} callback
 */
function getAllAgentsForEntity(customerID, entityName, entityType, callback) {
	getCachedByEntity(customerID, entityName, entityType, (err, entity) => {
		if (err) return callback(err);
		if (!entity) return callback(null, []);
		getAgentsByBeID(customerID, entity.beID, callback);
	});
}

/**
 * Returns solutions codes
 * @param {string} customerID - customer ID
 * @param {Function} callback
 */
function getSolutionsCodes(customerID, callback) {
	getKeysWithPrefix(customerID, relationHelper.getSolutionCodeKey(''), constants.TYPE_RELATIONSHIP, (err, keys) => {
		if (err) return callback(err);

		const result = keys.map(key => {
			const keyArr = key.split('.');
			return keyArr.splice(keyArr.length - 1, 1).splice(0, 2).join('.');
		});
		callback(null, result);
	});
}

/**
 * Returns keys with the same prefix
 * @param  {string}   customerID - customer ID
 * @param  {string}   search     - search pattern
 * @param  {number}   entityType - entity Type
 * @param  {Function} callback
 */
function getKeysWithPrefix(customerID, search, entityType, callback) {
	const prefix = `${customerID}.${search}`;
	const sufix = `.${entityType}`;
	const searchKey = `${prefix}*${sufix}`;
	if (redisClient.ready) {
		redisClient.keys(searchKey, (err, keys) => {
			if (err) callback(err);
			else {
				let result = [];
				for (var i = 0; i < keys.length; i++) {
					var key = keys[i];
					result.push(key.substring(prefix.length, key.length - sufix.length))
				}
				callback(null, result)
			}
		})
	}
	else callback(`Can't connect to redis`, null);
}
/**
 * Rerturns item count by Customer and entity type
 * @param  {string}   customerID
 * @param  {number}   entityType
 * @param  {Function} callback
 */
function getItemCountByCustomerAndType(customerID, entityType, callback) {
	const prefix = `${customerID}.`;
	const sufix = `.${entityType}`;
	const searchKey = `${prefix}*${sufix}`;

	if (redisClient.ready) {
		redisClient.keys(searchKey, (err, keys) => {
			if (err) callback(err);
			else callback(null, keys.length);
		})
	}
	else callback(`Can't connect to redis`, null);
}
/**
 * Rerturns item count by Customer, entity type and a prefix
 * @param  {string}   customerID
 * @param  {number}   entityType
 * @param  {Function} callback
 */
function getItemCountByCustomerTypeAndPrefix(customerID, prefix, entityType, callback) {
	const sufix = `.${entityType}`;
	const searchKey = `${customerID}.${prefix}*${sufix}`;

	if (redisClient.ready) {
		redisClient.keys(searchKey, (err, keys) => {
			if (err) callback(err);
			else callback(null, keys.length)
		})
	}
	else callback(`Can't connect to redis`, null);
}
/**
 * Return an array of objects {ID,TYPE} with the entities that matches search pattern (ignore case)
 * @param  {string}   customerID - customer ID
 * @param  {string}   search     - search pattern
 * @param  {number}   entityType - entity Type
 * @param  {Function} callback
 */
function getEntitiesFromUnknownType(customerID, search, callback) {
	const prefix = `${customerID}.`;
	const searchKey = `${prefix}*${toIgnoreCasePattern(search)}*`;

	if (redisClient.ready) {
		redisClient.keys(searchKey, (err, keys) => {
			if (err) callback(err);
			else {
				let result = [];
				for (let i = 0; i < keys.length; i++) {
					let key = keys[i]
					let keyArr = key.split('.');
					if (keyArr.length === 3) {
						result.push({
							ID: keyArr[1],
							TYPE: keyArr[2]
						})
					}
				}
				callback(null, result)
			}
		})
	}
	else callback(`Can't connect to redis`, null);
}

/**
 * Return a ignore case string for redis
 * @param  {string} str - input string
 * @return {string}     - redis ignore case string
 */
function toIgnoreCasePattern(str) {
	let result = '';
	for (var i = 0; i < str.length; i++) {
		result += '[' + str[i].toUpperCase() + str[i].toLowerCase() + ']';
	}
	return result
}

/**
 * Flush's redis db, only to use in test/local environment and fake redis
 * @param  {Function} callback [description]
 * @return [type]              [description]
 */
function flushdb(callback) {
	if (global.LOCAL_REDIS) redisClient.flushdb(callback);
	else callback(new Error(`DON'T USE THIS METHOD!`))
}

function ready() {
	return redisClient.ready
}

function quit() {
	return redisClient.quit()
}

/**
 * Retrieves all entities and inserts them in Redis (beID,<customer>.<entity ID>.<entity TYPE>)
 * @param  {string}   customerID
 * @param  {callback} globalcallback
 */
function refreshCache(customerID, globalcallback) {
	function setItems(keys, item, setItemCallback) {
		async.each(keys, (key, callback) => {
			const value = JSON.stringify(item);
			logger.debug('LSYNC', `set: ${key}`);
			setCacheNotReady(key, value, (err) => {
				if (err) {
					logger.error(err);
					callback(err);
				} else callback();
			});
		}, (err) => {
			if (err) setItemCallback(err);
			else setItemCallback(null, 'DONE')
		});
	};

	async.map(dbHelper.publicRepositories,
		(repository, callback) => {
			const tableName = dbHelper.getTableName(customerID, repository);
			dynamoDb.getAll(tableName, (err, data) => {
				if (err) {
					logger.error(err);
					callback(err)
				} else {
					for (var i = 0; i < data.length; i++) {
						data[i].TYPE = repository;
					}
					callback(null, data)
				}
			})
		}, (err, result) => {
			const entities = _.flatten(result);
			async.each(entities, (entity, callback) => {
				if (entity) {
					const entityKey = getKeyCacheForEntity(customerID, entity.ID, entity.TYPE);
					entity = dbHelper.addTypeCustomer(entity, entity.TYPE, customerID);
					const keys = [entityKey];
					if (entity.beID) keys.push(entity.beID);
					setItems(keys, entity, callback)
				}
				else callback();
			}, (err) => {
				globalcallback(err);
			})
		})
}

/**
 * Return true if email already exists and ID of userID is related to this email
 * @param  {string} userID            User ID
 * @param  {string} customer          Customer ID
 * @param  {string} email             User email
 * @param  {callback} callback
 */
function existEmail(userID, customer, email, callback) {
	getCachedByEntity(customer, relationHelper.getEmailKey(email), dynamoDb.TYPE_RELATIONSHIP, (err, data) => {
		let emailExists = false;

		if (err) return callback(err);
		if (data) {
			for (let key of data.CHILD) {
				if (key.ID === userID) {
					emailExists = true;
					break;
				}
			}
		}
		callback(null, emailExists);
	});
}
/**
 * Return true if email already exists
 * @param  {string} customer          Customer ID
 * @param  {string} email             User email
 * @param  {callback} globalcallback
 */
function existEmailKey(customer, email, globalcallback) {
	getCachedByEntity(customer, relationHelper.getEmailKey(email), dynamoDb.TYPE_RELATIONSHIP, (error, data) => {
		globalcallback(error, data ? true : false);
	});
}

/**
 * Retrieves status of Athena Semaphore
 * @param  {string} customer       Customer ID
 * @param  {callback} globalcallback
 */
function getSemaphore(customer, globalcallback) {
	if (redisClient.ready) {
		redisClient.get(getKeyAthenaSemaphore(customer), function (err, data) {
			if (err) globalcallback(logger.error(err));
			else globalcallback(null, data ? data : undefined);
		});
	}
	else globalcallback(new Error(`Redis not running - cannot get value for ${getKeyAthenaSemaphore(customer)}`));
}

/**
 * Updating the expiration date of the user password
 * @param  {string} customer          Customer ID
 * @param  {string} credentials       User name
 * @param  {string} type              consts.TYPE_USER
 * @param  {function} globalCallback  callback function
 */
function updateExpDatePassword(customer, credentials, type, globalCallback) {
	async.waterfall([
			function getUser(callback) {
				dynamoDb.getEntityInfoByType(customer, credentials, type, (err, userInfo) => {
					if (err) return callback(err);
					if (!userInfo) return callback('userError');
					callback(null, userInfo);
				});
			},
			function getAllProfilesOfUser(userInfo, callback) {
				let profiles = [];

				async.each(userInfo.CHILD.profiles, (profileID, nextProfile) => {
					getCachedByEntity(customer, profileID, constants.TYPE_PROFILE, (err, profileInfo) => {
						profiles.push(profileInfo);
						nextProfile();
					});
				}, (err) => {
					if (err) callback(err);
					else callback(null, profiles);
				});
			},
			function minExpirationDate(profiles, callback) {
				const defaultExpirationDate = moment().utc(moment.utc()).add(30, 'd').toISOString();

				const minExpirationDate = profiles.reduce((expirationDate, profile) => {
					if (profile.EXPIRATION === undefined) profile.EXPIRATION = defaultExpirationDate;
					let profileExpiration = moment(profile.EXPIRATION).utc(moment.utc()).toISOString();
					if (moment(expirationDate).isAfter(profileExpiration)) expirationDate = profileExpiration;
					return expirationDate;
				}, defaultExpirationDate);
				callback(null, minExpirationDate);
			},
			function updateExpDatePasswordUser(minExpirationDate, callback) {
				const item = {
					'PWD_EXP_FIELD': minExpirationDate
				};

				dynamoDb.updateItemInTableByType(customer, credentials, type, item, (err, data) => {
					if (err) return callback(err);
					if (!data) return callback(null, false);
					callback(null, true)
				});
			}
		],
		function waterfallResponse(err, data) {
			if (err) return globalCallback(err);
			globalCallback(null, data);
		});
};

function getKey(key, callback){
	redisClient.get(key,callback);
}

/**
 * Returns solution design lock key (<customer>.<solutionID>.SOLUTION_DESIGN_LOCK)
 * @param {string} customer
 * @param {string} solutionDesignID
 */
function getKeySolutionDesignLock(customer, solutionDesignID) {
	return `${customer}.${solutionDesignID}${SUFFIX_SOLUTION_DESIGN_LOCK}`;
}

/**
 * Returns solutions design lock object {userID, timeStamp}
 * @param {string}   customer
 * @param {string}   solutionDesignID
 * @param {function} callback
 */
function getSolutionDesignLock(customer, solutionDesignID, callback) {
	const key = getKeySolutionDesignLock(customer, solutionDesignID);

	redisClient.get(key, (err, data) => {
		if (err) return callback(err);
		let value;
		try {
			value = JSON.parse(data);
		} catch (e) {
			return callback(e);
		}
		callback(null, value);
	});
}

/**
 * Set solution design lock object {userID, timeStamp}
 * @param {string}   customer
 * @param {string}   solutionDesignID
 * @param {string}   userID
 * @param {function} callback
 */
function setSolutionDesignLock(customer, solutionDesignID, userID, callback) {
	const key = getKeySolutionDesignLock(customer, solutionDesignID);
	const value = {
		userID,
		timeStamp: moment().utc().toISOString(),
	};
	redisClient.set(key, JSON.stringify(value), (err) => {
		callback(err, value);
	});
}

/**
 * Deletes solution design lock object (releases solution design)
 * @param {string} customer
 * @param {string} solutionDesignID
 * @param {string} userID
 * @param {function} translator i18n instance
 * @param {function} callback
 */
function deleteSolutionDesignLock(customer, solutionDesignID, userID, translator, callback) {
	getSolutionDesignLock(customer, solutionDesignID, (err, data) => {
		if (err) return callback(err);
		if(!data) return callback(translator(`Can not release solution design of ${solutionDesignID}`));

		if (userID === data.userID) {
			const key = getKeySolutionDesignLock(customer, solutionDesignID);
			return redisClient.del(key, callback);
		}
		callback(translator(`Not found user ${userID}`));
	});
}

module.exports = {
	eventEmitter,
	existEmail,
	existEmailKey,
	getKey,
	getImmediateRelatedEntities,
	setLastEntryForBeID,
	setPreviousEntryForBeID,
	getLastEntryForBeID,
	getPreviousEntryForBeID,
	setEntityKeepAlive,
	setAlarmLastAlarm,
	setAlarmEvalLastTime,
	setAlarmExecLastTime,
	getAlarmEvalLastTime,
	getAlarmExecLastTime,
	setAlarmLastCondition,
	getAlarmLastCondition,
	getAlarmsInfo,
	getCachedByEntity,
	getCachedByCustomer,
	getCachedByBeID,
	getEntityKeepAliveLastTime,
	getKeyCacheForEntity,
	getKeyValueTypeCacheForBeID,
	getBeIDFromKeyValueType,
	entityMustBeNotified,
	getAllLastValues,
	getAllRelations,
	getEntityBeID,
	getEntityDataType,
	getEntityDataTypeByBeID,
	getEntitiesFromUnknownType,
	getItemCountByCustomerAndType,
	getItemCountByCustomerTypeAndPrefix,
	setCache,
	setCacheNotReady,
	delCache,
	delCacheNotReady,
	delCacheByEntity,
	getBucket,
	removePredictionModelFromCache,
	getCachedFirstTimeStamp,
	removeEntityFromCache,
	hasDataByBeID,
	hasDataByEntity,
	getValueAssociationEntitiesByBeID,
	ready,
	quit,
	flushdb,
	refreshCache,
	getAgentsByBeID,
	getAllEntitiesForISATag,
	getAllEntitiesForCustomTag,
	getAllAgentsForEntity,
	getAllRelatedEntities,
	getKeysWithPrefix,
	getSemaphore,
	getCaseInsensitiveKeys,
	getSolutionsCodes,
	updateExpDatePassword,
	getSolutionDesignLock,
	setSolutionDesignLock,
	deleteSolutionDesignLock,
	getKeyLastEntryCacheForBeID,
	getKeyPreviousEntryCacheForBeID,
	getKeyAthenaSemaphore,
	getKeySolutionDesignLock,
};
