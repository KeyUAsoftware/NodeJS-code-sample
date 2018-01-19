const { expect } = require('chai');
const async = require('async');
const moment = require('moment');
const { customer } = require('@bigfinite/create-environment').constants;
const cache = require('../../index').cache();
const relation = require('../../index').relationHelper();
const types = require('../../common/constants');
const userId = require('../data/entities/user').ID;
const associationChildId = require('../data/entities/associationChild').ID;
const agentId = require('../data/entities/agent').ID;
const timestamp = () => moment().utc(moment.utc()).valueOf();
const translator = (data) => data;
const unknownCustomer = 'unknownCustomer';
const unknownType = 'unknownType';
const unknownBeID = 'unknownBeID';
const unknownId = 'unknownId';
const fakeBeID = 'fakeBeID';
const fakeCustomer = 'fakeCustomer';
const fakeId = 'fakeId';
const fakeType = 0;
const fakeKeyForRedis = 'fakeKeyForRedis';
const fakeEmail = 'fakeEmail@gmail.com';
const solutionDesignLockId = 'solutionDesignLockId';
const userType = types.TYPE_USER;
const associationChildType = types.TYPE_ASSOCIATION;
const agentType = types.TYPE_AGENT;
const scenarioType = types.STRING_SCENARIO;
const relationshipType = types.TYPE_RELATIONSHIP;
const predictionModelType = types.TYPE_PREDICTION_MODEL;
const oldValueForRedis = {
	t: timestamp(),
	v: { testValue: 'OldValue' },
};
const valueSolutionDesignLock = {
	userID: userId,
	timeStamp: moment().utc(moment.utc()).toISOString(),
};
const addKeysForRedis = (key, keyValue, value) => {
	keysForRedis[key] = {
		keyValue,
		value,
	}
};

let keysForRedis = {};
let user;
let userBeId;
let associationChild;
let associationChildBeId;
let agent;
let agentBeId;
let dataUserType;
let newLastValueForRedis;
let newPreviousValueForRedis;

describe('Cache tests', () => {
	beforeAll((done) => {
		async.waterfall([
			(callback) => {
				cache.getCachedByEntity(customer, userId, userType, (err, data) => {
					if (err) throw new Error(err.message ? err.message : err);
					user = data;
					userBeId = data.beID;
					dataUserType = data.DATA_TYPE;
					callback();
				});
			},
			(callback) => {
				cache.getCachedByEntity(customer, associationChildId, associationChildType, (err, data) => {
					if (err) throw new Error(err.message ? err.message : err);
					associationChild = data;
					associationChildBeId = data.beID;
					callback();
				});
			},
			(callback) => {
				cache.getCachedByEntity(customer, agentId, agentType, (err, data) => {
					if (err) throw new Error(err.message ? err.message : err);
					agent = data;
					agentBeId = data.beID;
					callback();
				});
			},
			(callback) => {
				addKeysForRedis('lastKey', `${cache.getKeyLastEntryCacheForBeID(customer, userBeId)}`, oldValueForRedis);
				addKeysForRedis('previousKey', `${cache.getKeyPreviousEntryCacheForBeID(customer, userBeId)}`, oldValueForRedis);
				addKeysForRedis('relationsKey', `${customer}.${scenarioType}.${userBeId}.${relationshipType}`, 'testValueForRelations');
				addKeysForRedis('agentIdKey', `${customer}.${scenarioType}.${agentId}.${relationshipType}`, 'agentId');
				addKeysForRedis('forRemove', 'forRemove', 'testValueForRemove');
				addKeysForRedis('predictionModelKey', `${customer}.${userId}.${predictionModelType}`, { beID: unknownBeID });
				addKeysForRedis('forRemoveNext', 'forRemoveNext', 'testValueForRemove');
				addKeysForRedis('userBeId', `${unknownBeID}`, 'testValueForBeID');
				addKeysForRedis('semaphoreKey', `${cache.getKeyAthenaSemaphore(customer)}`, 'testValueForSemaphore');
				addKeysForRedis('solutionsCodeKey', `${customer}.${relation.getSolutionCodeKey(userId)}.${relationshipType}`, 'testValueForsolutionsCode');
				addKeysForRedis('solutionsCodeKey_2', `${customer}.${relation.getSolutionCodeKey(agentId)}.${relationshipType}`, 'testValueForsolutionsCode');
				addKeysForRedis('solutionDesignLockKey', `${cache.getKeySolutionDesignLock(customer, solutionDesignLockId)}`, valueSolutionDesignLock);
				callback();
			},
			(asyncCallback) => {
				async.each(keysForRedis, (element, callback) => {
					cache.setCache(element.keyValue, JSON.stringify(element.value), (err, data) => {
						if (err) throw new Error(err.message ? err.message : err);
						callback();
					});
				}, (err) => {
					if (err) throw new Error(err.message ? err.message : err);
					asyncCallback();
				});
			}
		], done);
	});

	afterAll((done) => {
		async.each(keysForRedis, (element, callback) => {
			cache.delCache(element.keyValue, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				callback();
			});
		}, (err) => {
			if (err) throw new Error(err.message ? err.message : err);
			done();
		});
	});

	describe('existEmail', () => {
		test('should return true if the email of a user is already exists', (done) => {
			cache.existEmail(userId, customer, user.EMAIL, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(true);
				done();
			});
		});

		test('should return false if the user is not related to email', (done) => {
			cache.existEmail(fakeId, customer, user.EMAIL, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(false);
				done();
			});
		});

		test('should return false if the email is not found', (done) => {
			cache.existEmail(userId, customer, fakeEmail, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(false);
				done();
			});
		});
	});

	describe('existEmailKey', () => {
		test('should return true if the email already exists', (done) => {
			cache.existEmailKey(customer, user.EMAIL, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(true);
				done();
			});
		});

		test('should return false if the email does not exist', (done) => {
			cache.existEmailKey(customer, fakeEmail, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(false);
				done();
			});
		});
	});

	describe('getImmediateRelatedEntities', () => {
		test('should return the array of all directly related entities', (done) => {
			cache.getImmediateRelatedEntities(customer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.not.be.empty;
				data.forEach((entity) => {
					relation.getNotInmediateRelationsForEntity(customer, entity, user, (err, parentEntity) => {
						if (err) throw new Error(err.message ? err.message : err);
						expect(parentEntity[0].ID).to.equal(userId);
						expect(parentEntity[0].TYPE).to.equal(userType);
					});
				});
				done();
			});
		});

		test('should return null if the customer is not found', (done) => {
			cache.getImmediateRelatedEntities(fakeCustomer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.a('null');
				done();
			});
		});
	});

	describe('setLastEntryForBeID', () => {
		test('should return the object with the old values', (done) => {
			newLastValueForRedis = {
				timestamp: timestamp(),
				value: {testValue: 'lastValue'}
			};
			cache.setLastEntryForBeID(customer, userBeId, newLastValueForRedis.timestamp, newLastValueForRedis.value, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('object');
				expect(data.t).to.equal(oldValueForRedis.t);
				expect(data.v.testValue).to.equal(oldValueForRedis.v.testValue);
				done();
			});
		});

		test('should return null if the last value is less or equal to the old value', (done) => {
			cache.setLastEntryForBeID(customer, userBeId, newLastValueForRedis.timestamp, newLastValueForRedis.value, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.a('null');
				done();
			});
		});
	});

	describe('getLastEntryForBeID', () => {
		test('should return the object with the values which set before', (done) => {
			cache.getLastEntryForBeID(customer, userBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('object');
				expect(data.t).to.equal(newLastValueForRedis.timestamp);
				expect(data.v.testValue).to.equal(newLastValueForRedis.value.testValue);
				done();
			});
		});

		test('should return undefined if the values are not found of fake beID', (done) => {
			cache.getLastEntryForBeID(customer, fakeBeID, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('undefined');
				done();
			});
		});
	});

	describe('setPreviousEntryForBeID', () => {
		test('should return the object with the old values', (done) => {
			newPreviousValueForRedis = {
				timestamp: timestamp(),
				value: {testValue: 'previousValue'}
			};
			cache.setPreviousEntryForBeID(customer, userBeId, newPreviousValueForRedis.timestamp, newPreviousValueForRedis.value, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('object');
				expect(data.t).to.equal(oldValueForRedis.t);
				expect(data.v.testValue).to.equal(oldValueForRedis.v.testValue);
				done();
			});
		});

		test('should return null if the previous value is less or equal to the old value', (done) => {
			cache.setPreviousEntryForBeID(customer, userBeId, newPreviousValueForRedis.timestamp, newPreviousValueForRedis.value, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.a('null');
				done();
			});
		});
	});

	describe('getPreviousEntryForBeID', () => {
		test('should return the object with the values which set before', (done) => {
			cache.getPreviousEntryForBeID(customer, userBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('object');
				expect(data.t).to.equal(newPreviousValueForRedis.timestamp);
				expect(data.v.testValue).to.equal(newPreviousValueForRedis.value.testValue);
				done();
			});
		});

		test('should return undefined if the values are not found of fake beID', (done) => {
			cache.getPreviousEntryForBeID(customer, fakeBeID, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('undefined');
				done();
			});
		});
	});

	describe('getKey', () => {
		test('should return the object which corresponds the key in Redis', (done) => {
			cache.getKey(keysForRedis.lastKey.keyValue, (err, dataStr) => {
				if (err) throw new Error(err.message ? err.message : err);
				const data = JSON.parse(dataStr);
				expect(err).to.be.a('null');
				expect(data).to.be.an('object');
				expect(data.t).to.equal(newLastValueForRedis.timestamp);
				expect(data.v.testValue).to.equal(newLastValueForRedis.value.testValue);
				done();
			});
		});

		test('should return null if the key is not found in Redis', (done) => {
			let dataParse;
			cache.getKey(fakeKeyForRedis, (err, dataStr) => {
				if (err) throw new Error(err.message ? err.message : err);
				dataParse = JSON.parse(dataStr);
				expect(err).to.be.a('null');
				expect(dataParse).to.be.a('null');
				done();
			});
		});
	});

	describe('getCachedByEntity', () => {
		test('should return the object of data of ID', (done) => {
			cache.getCachedByEntity(customer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('object');
				expect(data.ID).to.equal(userId);
				expect(data.ID_CUSTOMER).to.equal(customer);
				expect(data.TYPE).to.equal(userType);
				done();
			});
		});

		test('should return undefined if the customer of entity is not found', (done) => {
			cache.getCachedByEntity(fakeCustomer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('undefined');
				done();
			});
		});

		test('should return undefined if ID of entity is not found', (done) => {
			cache.getCachedByEntity(customer, fakeId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('undefined');
				done();
			});
		});

		test('should return undefined if the type of entity is not found', (done) => {
			cache.getCachedByEntity(customer, userId, fakeType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('undefined');
				done();
			});
		});
	});

	describe('getCachedByCustomer', () => {
		test('should return the object of data of customer', (done) => {
			cache.getCachedByCustomer(customer, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('object');
				expect(data.ID).to.equal(customer);
				done();
			});
		});

		test('should return an error if the customer of entity is not found', (done) => {
			cache.getCachedByCustomer(fakeCustomer, (err, data) => {
				expect(data).to.be.an('undefined');
				expect(() => {throw err}).to.throw(Error, `${fakeCustomer}`);
				done();
			});
		});
	});

	describe('getCachedByBeID', () => {
		test('should return the object of data of beID', (done) => {
			cache.getCachedByBeID(userBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('object');
				expect(data.beID).to.equal(userBeId);
				done();
			});
		});

		test('should return undefined if beID of entity is not found', (done) => {
			cache.getCachedByBeID(fakeBeID, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.an('undefined');
				expect(data).to.be.an('undefined');
				done();
			});
		});
	});

	describe('getKeyCacheForEntity', () => {
		test('should return the key for Redis', () => {
			expect(cache.getKeyCacheForEntity(customer, userId, userType)).to.equal(`${customer}.${userId}.${userType}`);
		});
	});

	describe('entityMustBeNotified', () => {
		test('should return type result of boolean of NOTIFY_ACK', (done) => {
			cache.entityMustBeNotified(customer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.a('boolean');
				expect(data).to.equal(user.NOTIFY_ACK);
				done();
			});
		});

		test('should return the error message if the customer of entity is not found', (done) => {
			cache.entityMustBeNotified(fakeCustomer, userId, userType, (err, data) => {
				expect(data).to.be.an('null');
				expect(err).to.include(`${userId}`);
				expect(err).to.include(`${userType}`);
				done();
			});
		});

		test('should return the error message if ID of entity is not found', (done) => {
			cache.entityMustBeNotified(customer, fakeId, userType, (err, data) => {
				expect(data).to.be.an('null');
				expect(err).to.include(`${fakeId}`);
				done();
			});
		});

		test('should return the error message if the type of entity is not found', (done) => {
			cache.entityMustBeNotified(customer, userId, fakeType, (err, data) => {
				expect(data).to.be.an('null');
				expect(err).to.include(`${fakeType}`);
				done();
			});
		});
	});

	describe('getAllLastValues', () => {
		test('should return the array of all last values', (done) => {
			cache.getAllLastValues(customer, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.not.be.empty;
				data.forEach((element) => {
					expect(element.entity.ID_CUSTOMER).to.equal(customer);
				});
				done();
			});
		});

		test('should return the empty array if the customer is not found', (done) => {
			cache.getAllLastValues(fakeCustomer, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});
	});

	describe('getAllRelations', () => {
		test('should return the object of all keys', (done) => {
			cache.getAllRelations(customer, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('object');
				expect(data).to.have.property(scenarioType);
				done();
			});
		});

		test('should return the empty object if the customer is not found', (done) => {
			cache.getAllRelations(fakeCustomer, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('object');
				expect(data).to.be.empty;
				done();
			});
		});
	});

	describe('getEntityBeID', () => {
		test('should return beID of entity', (done) => {
			cache.getEntityBeID(customer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(userBeId);
				done();
			});
		});

		test('should return the error message if the customer of entity is not found', (done) => {
			cache.getEntityBeID(fakeCustomer, userId, userType, (err, data) => {
				expect(data).to.be.an('null');
				expect(err).to.include(`${userId}`);
				expect(err).to.include(`${userType}`);
				done();
			});
		});

		test('should return the error message if ID of entity is not found', (done) => {
			cache.getEntityBeID(customer, fakeId, userType, (err, data) => {
				expect(data).to.be.an('null');
				expect(err).to.include(`${fakeId}`);
				done();
			});
		});

		test('should return the error message if the type of entity is not found', (done) => {
			cache.getEntityBeID(customer, userId, fakeType, (err, data) => {
				expect(data).to.be.an('null');
				expect(err).to.include(`${fakeType}`);
				done();
			});
		});
	});

	describe('getEntityDataType', () => {
		test('should return the data type of entity', (done) => {
			cache.getEntityDataType(customer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(dataUserType);
				done();
			});
		});

		test('should return the error message if the customer of entity is not found', (done) => {
			cache.getEntityDataType(fakeCustomer, userId, userType, (err, data) => {
				expect(data).to.be.an('null');
				expect(err).to.include(`${userId}`);
				expect(err).to.include(`${userType}`);
				done();
			});
		});

		test('should return the error message if ID of entity is not found', (done) => {
			cache.getEntityDataType(customer, fakeId, userType, (err, data) => {
				expect(data).to.be.an('null');
				expect(err).to.include(`${fakeId}`);
				done();
			});
		});

		test('should return the error message if the type of entity is not found', (done) => {
			cache.getEntityDataType(customer, userId, fakeType, (err, data) => {
				expect(data).to.be.an('null');
				expect(err).to.include(`${fakeType}`);
				done();
			});
		});
	});

	describe('getEntityDataTypeByBeID', () => {
		test('should return the data type of entity', (done) => {
			cache.getEntityDataTypeByBeID(userBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(dataUserType);
				done();
			});
		});

		test('should return the error message if the type of entity is not found', (done) => {
			cache.getEntityDataTypeByBeID(fakeBeID, (err, data) => {
				expect(data).to.be.an('null');
				expect(err).to.include(`${fakeBeID}`);
				done();
			});
		});
	});

	describe('getEntitiesFromUnknownType', () => {
		let search = userId;
		test('should return the array of all search values', (done) => {
			cache.getEntitiesFromUnknownType(customer, search, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				data.forEach((item) => {
					expect(item.ID).to.include(`${search}`);
				});
				done();
			});
		});

		test('should return the empty array if the searched text is not found', (done) => {
			search = 'fakeText';
			cache.getEntitiesFromUnknownType(customer, search, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});
	});

	describe('getItemCountByCustomerAndType', () => {
		test('should return amount of the keys of a customer by type of the entity', (done) => {
			cache.getItemCountByCustomerAndType(customer, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.a('number');
				expect(data).to.be.above(0);
				done();
			});
		});

		test('should return the number of keys 0 if the customer`s keys are not found', (done) => {
			cache.getItemCountByCustomerAndType(unknownCustomer, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(0);
				done();
			});
		});

		test('should return the number of keys 0 if the type is not found', (done) => {
			cache.getItemCountByCustomerAndType(customer, unknownType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(0);
				done();
			});
		});
	});

	describe('getItemCountByCustomerTypeAndPrefix', () => {
		test('should return amount of keys of customer, prefix and entity type', (done) => {
			cache.getItemCountByCustomerTypeAndPrefix(customer, scenarioType, relationshipType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.a('number');
				expect(data).to.be.above(0);
				done();
			});
		});

		test('should return the number of keys 0 if the customer`s keys are not found', (done) => {
			cache.getItemCountByCustomerTypeAndPrefix(fakeCustomer, scenarioType, relationshipType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(0);
				done();
			});
		});

		test('should return the number of keys 0 if the prefix is not found', (done) => {
			const fakePrefix = 'fakePrefix';
			cache.getItemCountByCustomerTypeAndPrefix(customer, fakePrefix, relationshipType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(0);
				done();
			});
		});

		test('should return the number of keys 0 if the type is not found', (done) => {
			cache.getItemCountByCustomerTypeAndPrefix(customer, scenarioType, fakeType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(0);
				done();
			});
		});
	});

	describe('setCache', () => {
		test('should return null if the key was set correctly', (done) => {
			addKeysForRedis('firstTestKey', 'firstTestKey', oldValueForRedis);
			cache.setCache(keysForRedis.firstTestKey.keyValue, JSON.stringify(keysForRedis.firstTestKey.value), (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.a('null');
				done();
			});
		});

		test('should return an error if the type of key for Redis is not correctly', (done) => {
			const fakeKey = false;
			cache.setCache(fakeKey, JSON.stringify(oldValueForRedis), (err, data) => {
				expect(data).to.be.an('undefined');
				expect(() => {throw err}).to.throw(Error, `${fakeKey}`);
				done();
			});
		});

		test('should return an error if the type of value for Redis is not correctly', (done) => {
			const fakeValue = false;
			addKeysForRedis('secondTestKey', 'secondTestKey', fakeValue);
			cache.setCache(keysForRedis.secondTestKey.keyValue, keysForRedis.secondTestKey.value, (err, data) => {
				expect(data).to.be.an('undefined');
				expect(() => {throw err}).to.throw(Error, `${fakeValue}`);
				done();
			});
		});

		test('should return the old value if the key for Redis is already exists', (done) => {
			const newValue = 'newValue';
			cache.setCache(keysForRedis.firstTestKey.keyValue, newValue, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(JSON.stringify(oldValueForRedis));
				done();
			});
		});
	});

	describe('setCacheNotReady', () => {
		test('should return null if the key was set correctly', (done) => {
			addKeysForRedis('thirdTestKey', 'thirdTestKey', oldValueForRedis);
			cache.setCacheNotReady(keysForRedis.thirdTestKey.keyValue, JSON.stringify(keysForRedis.thirdTestKey.value), (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.a('null');
				done();
			});
		});

		test('should return an error if the type of key for Redis is not correctly', (done) => {
			const fakeKey = false;
			cache.setCacheNotReady(fakeKey, JSON.stringify(oldValueForRedis), (err, data) => {
				expect(data).to.be.an('undefined');
				expect(() => {throw err}).to.throw(Error, `${fakeKey}`);
				done();
			});
		});

		test('should return an error if the type of value for Redis is not correctly', (done) => {
			const fakeValue = false;
			addKeysForRedis('fourthTestKey', 'fourthTestKey', fakeValue);
			cache.setCacheNotReady(keysForRedis.fourthTestKey.keyValue, keysForRedis.fourthTestKey.value, (err, data) => {
				expect(data).to.be.an('undefined');
				expect(() => {throw err}).to.throw(Error, `${fakeValue}`);
				done();
			});
		});

		test('should return the old value if the key for Redis is already exists', (done) => {
			const newValue = 'newValue';
			cache.setCacheNotReady(keysForRedis.thirdTestKey.keyValue, newValue, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(JSON.stringify(oldValueForRedis));
				done();
			});
		});
	});

	describe('delCache', () => {
		test('should return 1 if an entity was removed successfully', (done) => {
			cache.delCache(keysForRedis.forRemove.keyValue, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(1);
				done();
			});
		});

		test('should return 0 if the key is not found', (done) => {
			const fakeKey = 'fakeKey';
			cache.delCache(fakeKey, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(0);
				done();
			});
		});

		test('should return an error if the type of key for Redis is not correctly', (done) => {
			const fakeKey = false;
			cache.delCache(fakeKey, (err, data) => {
				expect(data).to.be.an('undefined');
				expect(() => {throw err}).to.throw(Error, `${fakeKey}`);
				done();
			});
		});
	});

	describe('delCacheNotReady', () => {
		test('should return 1 if an entity was removed successfully', (done) => {
			cache.delCacheNotReady(keysForRedis.forRemoveNext.keyValue, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(1);
				done();
			});
		});

		test('should return 0 if the key is not found', (done) => {
			const fakeKey = 'fakeKey';
			cache.delCacheNotReady(fakeKey, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(0);
				done();
			});
		});

		test('should return an error if the type of key for Redis is not correctly', (done) => {
			const fakeKey = false;
			cache.delCacheNotReady(fakeKey, (err, data) => {
				expect(data).to.be.an('undefined');
				expect(() => {throw err}).to.throw(Error, `${fakeKey}`);
				done();
			});
		});
	});

	describe('delCacheByEntity', () => {
		test('should return 1 if an entity was removed successfully', (done) => {
			cache.delCacheByEntity(customer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(1);
				done();
			});
		});

		test('should return 0 if the customer is not found', (done) => {
			cache.delCacheByEntity(unknownCustomer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(0);
				done();
			});
		});

		test('should return 0 if ID of entity is not found', (done) => {
			cache.delCacheByEntity(customer, fakeBeID, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(0);
				done();
			});
		});

		test('should return 0 if the type of entity is not found', (done) => {
			cache.delCacheByEntity(customer, userId, unknownType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(0);
				done();
			});
		});
	});

	describe('getBucket', () => {
		test('should return the bucket of entity', (done) => {
			cache.getBucket(customer, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.include(`${customer}`);
				done();
			});
		});

		test('should return an error if the customer of entity is not found', (done) => {
			cache.getBucket(fakeCustomer, (err, data) => {
				expect(data).to.be.an('undefined');
				expect(() => {throw err}).to.throw(Error, `${fakeCustomer}`);
				done();
			});
		});
	});

	describe('removePredictionModelFromCache', () => {
		test('should return 1 if a prediction model was removed successfully', (done) => {
			cache.removePredictionModelFromCache(customer, userId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(1);
				done();
			});
		});

		test('should return message if the customer of entity is not found', (done) => {
			cache.removePredictionModelFromCache(fakeCustomer, userId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.include(`No result`);
				done();
			});
		});

		test('should return message if ID of entity is not found', (done) => {
			cache.removePredictionModelFromCache(customer, fakeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.include(`No result`);
				done();
			});
		});
	});

	describe('removeEntityFromCache', () => {
		test('should return true if an entity was removed successfully', (done) => {
			cache.removeEntityFromCache(customer, userId, userType, userBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(true);
				done();
			});
		});

		test('should return false if the customer is not found', (done) => {
			cache.removeEntityFromCache(unknownCustomer, userId, userType, userBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(false);
				done();
			});
		});

		test('should return false if beID of an entity is not found', (done) => {
			cache.removeEntityFromCache(customer, userId, userType, unknownBeID, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(false);
				done();
			});
		});

		test('should return an error if the type of beID is not correctly', (done) => {
			const incorrectBeID = false;
			cache.removeEntityFromCache(customer, userId, userType, incorrectBeID, (err, data) => {
				expect(data).to.be.a('null');
				expect(() => {throw err}).to.throw(`${incorrectBeID}`);
				done();
			});
		});
	});

	describe('hasDataByBeID', () => {
		test('should return true if the entity has data', (done) => {
			cache.hasDataByBeID(customer, userBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(true);
				done();
			});
		});

		test('should return false if the entity does not have data', (done) => {
			cache.hasDataByBeID(fakeCustomer, userBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(false);
				done();
			});
		});
	});

	describe('hasDataByEntity', () => {
		test('should return true if the entity has data', (done) => {
			cache.hasDataByEntity(customer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(true);
				done();
			});
		});

		test('should return undefined if the entity does not have data', (done) => {
			cache.hasDataByEntity(fakeCustomer, userId, userType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('undefined');
				done();
			});
		});
	});

	describe('getValueAssociationEntitiesByBeID', () => {
		test('should return the array of all child entities', (done) => {
			cache.getValueAssociationEntitiesByBeID(customer, associationChildBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.not.be.empty;
				async.eachOf(data, (element, key, callback) => {
					expect(element.ID).to.equal(associationChild.CHILD[key].ID);
					expect(element.TYPE).to.equal(associationChild.CHILD[key].TYPE);
					callback();
				}, (err) => {
					if (err) throw new Error(err.message ? err.message : err);
					done();
				});
			});
		});

		test('should return the empty array if the customer is not found', (done) => {
			cache.getValueAssociationEntitiesByBeID(fakeCustomer, associationChildBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});

		test('should return the empty array if beId of an entity is not found', (done) => {
			cache.getValueAssociationEntitiesByBeID(customer, fakeBeID, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});
	});

	describe('getAgentsByBeID', () => {
		test('should return the array of all child entities', (done) => {
			cache.getAgentsByBeID(customer, agentBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.not.be.empty;
				data.forEach((element, key) => {
					expect(element.ID).to.equal(agent.CHILD[key].ID);
					expect(element.TYPE).to.equal(agent.CHILD[key].TYPE);
				});
				done();
			});
		});

		test('should return the empty array if the customer is not found', (done) => {
			cache.getAgentsByBeID(fakeCustomer, agentBeId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});

		test('should return the empty array if beId of an entity is not found', (done) => {
			cache.getAgentsByBeID(customer, fakeBeID, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});
	});

	describe('getAllEntitiesForISATag', () => {
		test('should return the array of all child entities', (done) => {
			cache.getAllEntitiesForISATag(customer, types.DYNAMO_DB_FIELD_ISA_TAGS, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.not.be.empty;
				data.forEach((element, key) => {
					expect(element.ID).to.equal(agent.CHILD[key].ID);
					expect(element.TYPE).to.equal(agent.CHILD[key].TYPE);
				});
				done();
			});
		});

		test('should return the empty array if the customer is not found', (done) => {
			cache.getAllEntitiesForISATag(fakeCustomer, types.DYNAMO_DB_FIELD_ISA_TAGS, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});

		test('should return the empty array if isa_tag is not found', (done) => {
			cache.getAllEntitiesForISATag(customer, 'fakeISA_TAG', (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});
	});

	describe('getAllEntitiesForCustomTag', () => {
		test('should return the array of all child entities', (done) => {
			cache.getAllEntitiesForCustomTag(customer, types.DYNAMO_DB_FIELD_CUSTOM_TAGS, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.not.be.empty;
				data.forEach((element, key) => {
					expect(element.ID).to.equal(agent.CHILD[key].ID);
					expect(element.TYPE).to.equal(agent.CHILD[key].TYPE);
				});
				done();
			});
		});

		test('should return the empty array if the customer is not found', (done) => {
			cache.getAllEntitiesForCustomTag(fakeCustomer, types.DYNAMO_DB_FIELD_CUSTOM_TAGS, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});

		test('should return the empty array if custom_tag is not found', (done) => {
			cache.getAllEntitiesForCustomTag(customer, 'fakeCustomTag', (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});
	});

	describe('getAllAgentsForEntity', () => {
		const searchId = userId;
		const searchType = userType;

		test('should return the array of all agents of the entity', (done) => {
			cache.getAllAgentsForEntity(customer, searchId, searchType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.not.be.empty;
				data.forEach((item) => {
					let existItem = false;
					for (let key of item.PARENTS) {
						if (key.ID === searchId && key.TYPE === searchType) {
							existItem = true;
							break;
						}
					}
					expect(existItem).to.equal(true);
				});
				done();
			});
		});

		test('should return the empty array if the customer is not found', (done) => {
			cache.getAllAgentsForEntity(fakeCustomer, searchId, searchType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.empty;
				done();
			});
		});
	});

	describe('getAllRelatedEntities', () => {
		test('should return the array of all child entities', (done) => {
			cache.getAllRelatedEntities(customer, agentId, agentType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.not.be.empty;
				data.forEach((element, key) => {
					expect(element.ID).to.equal(agent.CHILD[key].ID);
					expect(element.TYPE).to.equal(agent.CHILD[key].TYPE);
				});
				done();
			});
		});

		test('should return undefined if the customer is not found', (done) => {
			cache.getAllRelatedEntities(fakeCustomer, agentId, agentType, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('undefined');
				done();
			});
		});
	});

	describe('getKeysWithPrefix', () => {
		test('should return the array of all found prefix in the keys of Redis', (done) => {
			cache.getKeysWithPrefix(customer, scenarioType, relationshipType, (err, prefixKeys) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(prefixKeys).to.be.an('array');
				expect(prefixKeys).to.not.be.empty;
				cache.getCaseInsensitiveKeys(scenarioType, customer, '*', (err, allKeys) => {
					if (err) throw new Error(err.message ? err.message : err);
					prefixKeys.forEach((item) => {
						let existItem = false;
						for (let key of allKeys) {
							if (key.indexOf(item) + 1) {
								existItem = true;
								break;
							}
						}
						expect(existItem).to.equal(true);
					});
					done();
				});
			});
		});

		test('should return the empty array if the customer is not found', (done) => {
			cache.getKeysWithPrefix(fakeCustomer, scenarioType, relationshipType, (err, prefixKeys) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(prefixKeys).to.be.an('array');
				expect(prefixKeys).to.be.empty;
				done();
			});
		});
	});

	describe('getSemaphore', () => {
		test('should return value of semaphore', (done) => {
			cache.getSemaphore(customer, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(JSON.parse(data)).to.equal(keysForRedis.semaphoreKey.value);
				done();
			});
		});

		test('should return undefined if the customer of entity is not found', (done) => {
			cache.getSemaphore(fakeCustomer, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('undefined');
				done();
			});
		});
	});

	describe('getCaseInsensitiveKeys', () => {
		test('should return the array of all possible cases', (done) => {
			const scenarioKeys = [
				keysForRedis.relationsKey.keyValue,
				keysForRedis.agentIdKey.keyValue,
			];
			cache.getCaseInsensitiveKeys(scenarioType, customer, '*', (err, allKeys) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(allKeys).to.be.an('array');
				expect(allKeys).to.not.be.empty;
				scenarioKeys.forEach((item) => {
					let existItem = false;
					for (let key of allKeys) {
						if (item === key) {
							existItem = true;
							break;
						}
					}
					expect(existItem).to.equal(true);
				});
				done();
			});
		});

		test('should return the empty array if the customer is not found', (done) => {
			cache.getCaseInsensitiveKeys(scenarioType, fakeCustomer, '*', (err, allKeys) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(allKeys).to.be.an('array');
				expect(allKeys).to.be.empty;
				done();
			});
		});
	});

	describe('getSolutionsCodes', () => {
		test('should return the array of all solutions codes', (done) => {
			const searchKeys = [
				keysForRedis.solutionsCodeKey.keyValue,
				keysForRedis.solutionsCodeKey_2.keyValue,
			];
			cache.getSolutionsCodes(customer, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.not.be.empty;
				if (err) throw new Error(err.message ? err.message : err);
				data.forEach((item) => {
					let existItem = false;
					for (let key of searchKeys) {
						if (key.indexOf(item) + 1) {
							existItem = true;
							break;
						}
					}
					expect(existItem).to.equal(true);
				});
				done();
			});
		});

		test('should return the empty array if the customer is not found', (done) => {
			cache.getSolutionsCodes(fakeCustomer, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.an('array');
				expect(data).to.be.empty;
				done();
			});
		});
	});

	describe('updateExpDatePassword', () => {
		test('should return true if updating expiration date of a password was successful', (done) => {
			async.waterfall([
				(callback) => {
					cache.updateExpDatePassword(customer, userId, userType, (err, data) => {
						if (err) throw new Error(err.message ? err.message : err);
						expect(err).to.be.a('null');
						expect(data).to.equal(true);
						callback();
					});
				},
				(callback) => {
					cache.delCache(`${customer}.${userId}.${userType}`, (err, data) => {
						if (err) throw new Error(err.message ? err.message : err);
						callback();
					});
				},
				(callback) => {
					cache.getCachedByEntity(customer, userId, userType, (err, updateUser) => {
						if (err) throw new Error(err.message ? err.message : err);
						const oldExpDatePassword = moment(user.PWD_EXP_FIELD).valueOf();
						const newExpDatePassword = moment(updateUser.PWD_EXP_FIELD).valueOf();
						expect(newExpDatePassword).to.be.above(oldExpDatePassword);
						callback();
					});
				},
			], done);
		});

		test('should return the error message if the customer is not found', (done) => {
			cache.updateExpDatePassword(fakeCustomer, userId, userType, (err, data) => {
				expect(data).to.be.an('undefined');
				expect(err).to.include('userError');
				done();
			});
		});
	});

	describe('getSolutionDesignLock', () => {
		test('should return the object of solutions design lock', (done) => {
			cache.getSolutionDesignLock(customer, solutionDesignLockId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.deep.equal(keysForRedis.solutionDesignLockKey.value);
				done();
			});
		});

		test('should return null if the customer is not found', (done) => {
			cache.getSolutionDesignLock(fakeCustomer, solutionDesignLockId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.be.a('null');
				done();
			});
		});
	});

	describe('setSolutionDesignLock', () => {
		test('should return the new object of solutions design lock', (done) => {
			cache.setSolutionDesignLock(customer, solutionDesignLockId, userId, (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data.userID).to.equal(keysForRedis.solutionDesignLockKey.value.userID);
				done();
			});
		});
	});

	describe('deleteSolutionDesignLock', () => {
		test('should return the error message if ID of solution design is not found', (done) => {
			const fakeSolutionDesignLockId = 'fakeSolutionDesignLockId';
			cache.deleteSolutionDesignLock(customer, fakeSolutionDesignLockId, userId, translator, (err, data) => {
				expect(data).to.be.an('undefined');
				expect(err).to.include(fakeSolutionDesignLockId);
				done();
			});
		});

		test('should return the error message if ID of entity is not found', (done) => {
			cache.deleteSolutionDesignLock(customer, solutionDesignLockId, fakeId, translator, (err, data) => {
				expect(data).to.be.an('undefined');
				expect(err).to.include(fakeId);
				done();
			});
		});

		test('should return 1 if solutions design lock was removed successfully', (done) => {
			cache.deleteSolutionDesignLock(customer, solutionDesignLockId, userId, '', (err, data) => {
				if (err) throw new Error(err.message ? err.message : err);
				expect(err).to.be.a('null');
				expect(data).to.equal(1);
				done();
			});
		});
	});
});
