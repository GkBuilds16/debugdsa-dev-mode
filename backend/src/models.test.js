import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import Codebase from './models/Codebase.js';
import Battle from './models/Battle.js';
import Registration from './models/Registration.js';
import Bookmark from './models/Bookmark.js';

test('Codebase schema requires creator and title fields and enforces difficulty values', () => {
  const missing = new Codebase({});
  const missingError = missing.validateSync();
  assert.ok(missingError.errors.ownerId);
  assert.ok(missingError.errors.title);
  assert.ok(missingError.errors.description);
  const invalid = new Codebase({ ownerId: 'u1', title: 'x', description: 'y', difficulty: 'Extreme' });
  assert.ok(invalid.validateSync().errors.difficulty);
});

test('confidential creator fields are excluded by default', () => {
  assert.equal(Codebase.schema.path('privateNotes').options.select, false);
  assert.equal(Codebase.schema.path('hiddenTests').options.select, false);
});

test('battle bounds and unique participant constraints are defined in schemas', () => {
  const battle = new Battle({ ownerId: 'u1', codebaseId: new mongoose.Types.ObjectId(), title: 'Battle', startsAt: new Date(), registrationDeadline: new Date(), durationMinutes: 0, capacity: 1 });
  const error = battle.validateSync();
  assert.ok(error.errors.durationMinutes);
  assert.ok(error.errors.capacity);
  const hasUniqueRegistration = Registration.schema.indexes().some(([fields, options]) => fields.battleId === 1 && fields.userId === 1 && options.unique === true);
  assert.equal(hasUniqueRegistration, true);
  const hasUniqueBookmark = Bookmark.schema.indexes().some(([fields, options]) => fields.codebaseId === 1 && fields.userId === 1 && options.unique === true);
  assert.equal(hasUniqueBookmark, true);
});
