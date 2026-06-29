import Dexie from 'dexie';

export const db = new Dexie('GymDatabase');
db.version(2).stores({
  workoutDays: '++id, name, createdAt',
  exercises: '++id, workoutDayId, name, sets',
});
