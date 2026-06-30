import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ArrowLeft, Trash2, Edit2, Check, RotateCcw, Settings, Activity, Square } from 'lucide-react';
import { db } from './db';

const createEmptySet = (weight = 0, reps = 0) => ({
  weight,
  reps,
  completed: false,
});

function normalizeSets(rawSets) {
  if (!Array.isArray(rawSets) || rawSets.length === 0) {
    return Array.from({ length: 3 }, () => createEmptySet());
  }

  return rawSets.map((set) => ({
    weight: Number(set?.weight) || 0,
    reps: Number(set?.reps) || 0,
    completed: Boolean(set?.completed),
    completedAt: set?.completedAt,
  }));
}

function normalizeExercise(exercise) {
  const fallbackName =
    typeof exercise?.name === 'string' && exercise.name.trim()
      ? exercise.name.trim()
      : typeof exercise?.sets === 'string' && exercise.sets.trim()
        ? exercise.sets.trim()
        : 'Без названия';

  return {
    ...exercise,
    name: fallbackName,
    sets: normalizeSets(exercise?.sets),
    restTime: Number(exercise?.restTime) > 0 ? Number(exercise.restTime) : 120,
  };
}

function normalizeWorkoutDay(workoutDay) {
  return {
    ...workoutDay,
    name:
      typeof workoutDay?.name === 'string' && workoutDay.name.trim()
        ? workoutDay.name.trim()
        : 'Без названия',
    exerciseRestTime:
      Number(workoutDay?.exerciseRestTime) > 0 ? Number(workoutDay.exerciseRestTime) : 180,
  };
}

function useSwipeBack(enabled, onBack) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
  const gestureStateRef = useRef({
    tracking: false,
    activated: false,
    startX: 0,
    startY: 0,
  });
  const animationFrameRef = useRef(null);

  const applySwipeOffset = (nextOffset) => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = window.requestAnimationFrame(() => {
      setSwipeOffset(nextOffset);
      animationFrameRef.current = null;
    });
  };

  const handleTouchStart = (event) => {
    if (!enabled) {
      return;
    }

    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }

    gestureStateRef.current = {
      tracking: true,
      activated: false,
      startX: touch.clientX,
      startY: touch.clientY,
    };

    setSwipeOffset(0);
    setIsSwipeDragging(false);
  };

  const handleTouchMove = (event) => {
    if (!enabled || !gestureStateRef.current.tracking) {
      return;
    }

    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - gestureStateRef.current.startX;
    const deltaY = Math.abs(touch.clientY - gestureStateRef.current.startY);

    if (deltaX <= 0) {
      applySwipeOffset(0);
      setIsSwipeDragging(false);
      return;
    }

    if (!gestureStateRef.current.activated) {
      if (deltaY > 16 && deltaY > deltaX) {
        gestureStateRef.current.tracking = false;
        applySwipeOffset(0);
        setIsSwipeDragging(false);
        return;
      }

      if (deltaX < 14 || deltaX <= deltaY) {
        return;
      }

      gestureStateRef.current.activated = true;
    }

    if (deltaY > 72 && deltaY > deltaX) {
      gestureStateRef.current.tracking = false;
      applySwipeOffset(0);
      setIsSwipeDragging(false);
      return;
    }

    const adjustedDeltaX = Math.max(0, deltaX - 10);
    const easedOffset = Math.min(118, 118 * (1 - Math.exp(-adjustedDeltaX / 120)));
    setIsSwipeDragging(true);
    applySwipeOffset(easedOffset);
  };

  const handleTouchEnd = (event) => {
    if (!enabled || !gestureStateRef.current.tracking) {
      setIsSwipeDragging(false);
      setSwipeOffset(0);
      return;
    }

    const touch = event.changedTouches?.[0];
    if (!touch) {
      gestureStateRef.current.tracking = false;
      setIsSwipeDragging(false);
      setSwipeOffset(0);
      return;
    }

    const deltaX = touch.clientX - gestureStateRef.current.startX;
    const deltaY = Math.abs(touch.clientY - gestureStateRef.current.startY);

    gestureStateRef.current.tracking = false;
    setIsSwipeDragging(false);

    if (deltaX > 72 && deltaY < 88 && deltaX > deltaY) {
      applySwipeOffset(0);
      window.requestAnimationFrame(() => {
        onBack();
      });
      return;
    }

    applySwipeOffset(0);
  };

  const handleTouchCancel = () => {
    gestureStateRef.current.tracking = false;
    gestureStateRef.current.activated = false;
    setIsSwipeDragging(false);
    applySwipeOffset(0);
  };

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    },
    style: {
      transform: swipeOffset > 0 ? `translate3d(${swipeOffset}px, 0, 0)` : 'translate3d(0, 0, 0)',
      transition: isSwipeDragging
        ? 'transform 72ms cubic-bezier(0.22, 1, 0.36, 1)'
        : 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
      willChange: 'transform',
    },
  };
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isSplashLeaving, setIsSplashLeaving] = useState(false);
  const [screen, setScreen] = useState('home');
  const [activeWorkoutSessionId, setActiveWorkoutSessionId] = useState(null);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [currentSetIndex, setCurrentSetIndex] = useState(null);
  const [completedSetIndex, setCompletedSetIndex] = useState(null);
  const [exerciseTimer, setExerciseTimer] = useState(0);
  const [activeExerciseId, setActiveExerciseId] = useState(null);
  const [restTimer, setRestTimer] = useState(0);
  const [restDuration, setRestDuration] = useState(0);
  const [restContext, setRestContext] = useState(null);
  const [isSetActive, setIsSetActive] = useState(false);
  const [isRestActive, setIsRestActive] = useState(false);
  const [isRestAlarmActive, setIsRestAlarmActive] = useState(false);
  const [activeTimerSource, setActiveTimerSource] = useState(null);
  const [exerciseRestReady, setExerciseRestReady] = useState(null);
  const [isWorkoutFinishing, setIsWorkoutFinishing] = useState(false);

  const workoutDays = useLiveQuery(
    () => db.workoutDays.toArray().then((items) => items.map(normalizeWorkoutDay)),
    []
  );
  const exercises = useLiveQuery(() => {
    if (!selectedWorkout) return [];
    return db.exercises
      .where('workoutDayId')
      .equals(selectedWorkout.id)
      .toArray()
      .then((items) => items.map(normalizeExercise));
  }, [selectedWorkout]);

  useEffect(() => {
    const startExitId = window.setTimeout(() => {
      setIsSplashLeaving(true);
    }, 1850);

    const hideSplashId = window.setTimeout(() => {
      setShowSplash(false);
    }, 2450);

    return () => {
      window.clearTimeout(startExitId);
      window.clearTimeout(hideSplashId);
    };
  }, []);

  useEffect(() => {
    if (!selectedWorkout || !Array.isArray(workoutDays)) {
      return;
    }

    const freshWorkout = workoutDays.find((workout) => workout.id === selectedWorkout.id);

    if (!freshWorkout) {
      setSelectedWorkout(null);
      return;
    }

    if (freshWorkout !== selectedWorkout) {
      setSelectedWorkout(freshWorkout);
    }
  }, [selectedWorkout, workoutDays]);

  useEffect(() => {
    if (!selectedExercise || !Array.isArray(exercises)) {
      return;
    }

    const freshExercise = exercises.find((exercise) => exercise.id === selectedExercise.id);

    if (!freshExercise) {
      if (activeTimerSource?.exerciseId === selectedExercise.id) {
        return;
      }

      setSelectedExercise(null);
      return;
    }

    if (freshExercise !== selectedExercise) {
      setSelectedExercise(freshExercise);
    }
  }, [activeTimerSource, exercises, selectedExercise]);

  useEffect(() => {
    if (!isWorkoutFinishing) {
      return;
    }

    const finishingWorkoutId = selectedWorkout?.id;

    const timeoutId = window.setTimeout(async () => {
      if (finishingWorkoutId) {
        const workoutExercises = await db.exercises.where('workoutDayId').equals(finishingWorkoutId).toArray();

        await Promise.all(
          workoutExercises.map((exercise) => db.exercises.update(exercise.id, {
            sets: normalizeSets(exercise.sets).map((set) => ({
              ...set,
              completed: false,
              completedAt: undefined,
            })),
          }))
        );
      }

      setIsWorkoutFinishing(false);
      setScreen('home');
      setActiveWorkoutSessionId(null);
      setSelectedWorkout(null);
      setSelectedExercise(null);
      setCurrentSetIndex(null);
      setCompletedSetIndex(null);
      setIsSetActive(false);
      setIsRestActive(false);
      setExerciseTimer(0);
      setActiveExerciseId(null);
      setRestTimer(0);
      setRestDuration(0);
      setRestContext(null);
      setIsRestAlarmActive(false);
      setActiveTimerSource(null);
      setExerciseRestReady(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [isWorkoutFinishing, selectedWorkout]);

  const playBeep = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.18;

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.6);
    } catch (error) {
      console.error('Error playing beep:', error);
    }
  };

  const createTimerSource = (workout, exercise, scope = 'exercise') => {
    if (!workout || (!exercise && scope !== 'workout')) {
      return null;
    }

    return {
      workoutId: workout.id,
      workoutName: workout.name,
      scope,
      exerciseId: exercise?.id ?? exercise?.exerciseId ?? null,
      exerciseName: exercise?.name ?? exercise?.exerciseName ?? null,
    };
  };

  const openActiveTimerExercise = async () => {
    if (!activeTimerSource?.workoutId) {
      return;
    }

    let workout =
      selectedWorkout?.id === activeTimerSource.workoutId
        ? selectedWorkout
        : (workoutDays || []).find((item) => item.id === activeTimerSource.workoutId);

    if (!workout) {
      const rawWorkout = await db.workoutDays.get(activeTimerSource.workoutId);
      workout = rawWorkout ? normalizeWorkoutDay(rawWorkout) : null;
    }

    if (!workout) {
      return;
    }

    setSelectedWorkout(workout);
    setActiveWorkoutSessionId(workout.id);
    setScreen('workout');

    if (activeTimerSource.scope === 'workout') {
      setSelectedExercise(null);
      return;
    }

    let exercise =
      selectedWorkout?.id === workout.id
        ? (exercises || []).find((item) => item.id === activeTimerSource.exerciseId)
        : null;

    if (!exercise && activeTimerSource.exerciseId) {
      const rawExercise = await db.exercises.get(activeTimerSource.exerciseId);
      exercise = rawExercise ? normalizeExercise(rawExercise) : null;
    }

    if (exercise) {
      setSelectedExercise(exercise);
    }
  };

  useEffect(() => {
    let interval;
    if (isSetActive && currentSetIndex !== null && activeExerciseId !== null) {
      interval = setInterval(() => {
        setExerciseTimer(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSetActive, currentSetIndex, activeExerciseId]);

  useEffect(() => {
    let interval;
    if (isRestActive && restTimer > 0) {
      interval = setInterval(() => {
        setRestTimer(t => {
          if (t <= 1) {
            setIsRestActive(false);
            setCompletedSetIndex(null);
            setIsRestAlarmActive(true);
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRestActive, restTimer]);

  useEffect(() => {
    if (!isRestAlarmActive) {
      return;
    }

    playBeep();
    const intervalId = window.setInterval(() => {
      playBeep();
    }, 1300);

    return () => window.clearInterval(intervalId);
  }, [isRestAlarmActive]);

  const addWorkoutDay = async (name, exerciseRestTime) => {
    await db.workoutDays.add({
      name,
      createdAt: Date.now(),
      exerciseRestTime: exerciseRestTime || 180,
    });
    setScreen('home');
  };

  const updateWorkoutDayRestTime = async (id, exerciseRestTime) => {
    await db.workoutDays.update(id, {
      exerciseRestTime: exerciseRestTime || 180,
    });
  };

  const deleteWorkoutDay = async (id) => {
    await db.workoutDays.delete(id);
    await db.exercises.where('workoutDayId').equals(id).delete();

    if (selectedWorkout?.id === id || activeWorkoutSessionId === id) {
      setSelectedWorkout(null);
      setActiveWorkoutSessionId(null);
      resetWorkoutRuntimeState();
      setScreen('home');
    }
  };

  const markSetComplete = (exercise, setIndex) => {
    const updatedSets = [...exercise.sets];
    updatedSets[setIndex] = { ...updatedSets[setIndex], completed: true, completedAt: Date.now() };
    updateExercise(exercise.id, exercise.name, updatedSets, exercise.restTime, true);
    setIsSetActive(false);
    setActiveExerciseId(null);
    setExerciseTimer(0);
    setActiveTimerSource(null);

    const isLastSet = setIndex === exercise.sets.length - 1;
    const allSetsComplete = updatedSets.every(s => s.completed);
    const hasMoreExercises = (exercises || []).some(
      (item) => item.id !== exercise.id && !item.sets.every((set) => set.completed)
    );

    if (isLastSet && allSetsComplete) {
      setCurrentSetIndex(null);
      setSelectedExercise(null);
      setCompletedSetIndex(null);
      if (hasMoreExercises) {
        setExerciseRestReady({
          exerciseId: exercise.id,
          exerciseName: exercise.name,
        });
      }
    } else {
      setCurrentSetIndex(null);
      setCompletedSetIndex(setIndex);
    }
  };

  const cancelSet = (exercise, setIndex) => {
    setIsSetActive(false);
    setCurrentSetIndex(null);
    setActiveExerciseId(null);
    setExerciseTimer(0);
    setActiveTimerSource(null);
  };

  const startRestTimerForExercise = (exercise) => {
    const duration = exercise.restTime || 120;
    setRestContext('set');
    setRestDuration(duration);
    setRestTimer(duration);
    setIsRestActive(true);
    setIsRestAlarmActive(false);
    setActiveExerciseId(exercise.id);
    setActiveTimerSource(createTimerSource(selectedWorkout, exercise));
  };

  const startRestTimerBetweenExercises = () => {
    const duration = selectedWorkout?.exerciseRestTime || 180;
    setExerciseRestReady(null);
    setRestContext('exercise');
    setRestDuration(duration);
    setRestTimer(duration);
    setIsRestActive(true);
    setIsRestAlarmActive(false);
    setActiveExerciseId(null);
    setActiveTimerSource(createTimerSource(selectedWorkout, null, 'workout'));
  };

  const skipRest = () => {
    setIsRestActive(false);
    setRestTimer(0);
    setRestDuration(0);
    setRestContext(null);
    setCompletedSetIndex(null);
    setActiveExerciseId(null);
    setActiveTimerSource(null);
  };

  const stopRestAlarm = () => {
    setIsRestAlarmActive(false);
    setRestTimer(0);
    setRestDuration(0);
    setRestContext(null);
    setActiveExerciseId(null);
    setActiveTimerSource(null);
  };

  const resetExercise = (exercise) => {
    const updatedSets = exercise.sets.map(set => ({ ...set, completed: false, completedAt: undefined }));
    updateExercise(exercise.id, exercise.name, updatedSets, exercise.restTime, true);
  };

  const updateExerciseSetField = async (exercise, setIndex, field, value) => {
    const updatedSets = exercise.sets.map((set, index) => {
      if (index < setIndex) {
        return set;
      }

      return { ...set, [field]: value };
    });

    await updateExercise(exercise.id, exercise.name, updatedSets, exercise.restTime, true);
  };

  const addExercise = async (name, sets, restTime) => {
    if (!selectedWorkout) return;
    await db.exercises.add({
      workoutDayId: selectedWorkout.id,
      name: name.trim(),
      sets: normalizeSets(sets),
      restTime: restTime || 120,
    });
    setScreen('editWorkout');
  };

  const updateExercise = async (id, name, sets, restTime, keepScreen = false) => {
    await db.exercises.update(id, {
      name: name.trim(),
      sets: normalizeSets(sets),
      restTime: restTime || 120,
    });
    if (!keepScreen) {
      setScreen('editWorkout');
    }
  };

  const deleteExercise = async (id) => {
    await db.exercises.delete(id);
  };

  const resetWorkoutRuntimeState = () => {
    setSelectedExercise(null);
    setCurrentSetIndex(null);
    setCompletedSetIndex(null);
    setIsSetActive(false);
    setIsRestActive(false);
    setExerciseTimer(0);
    setActiveExerciseId(null);
    setRestTimer(0);
    setRestDuration(0);
    setRestContext(null);
    setIsRestAlarmActive(false);
    setActiveTimerSource(null);
    setExerciseRestReady(null);
    setIsWorkoutFinishing(false);
  };

  const showActiveTimerNotch = Boolean(
    activeTimerSource &&
    (isSetActive || isRestActive || isRestAlarmActive) &&
    !(screen === 'workout' && (selectedExercise || activeTimerSource.scope === 'workout'))
  );
  const activeTimerKind = isSetActive ? 'set' : isRestAlarmActive ? 'alarm' : 'rest';
  const activeTimerSeconds = isSetActive ? exerciseTimer : restTimer;

  if (showSplash) {
    return <SplashScreen isLeaving={isSplashLeaving} />;
  }

  return (
    <div className="min-h-screen bg-[#0B1528] select-none overscroll-behavior-y-contain">
      {showActiveTimerNotch && (
        <ActiveTimerNotch
          timerKind={activeTimerKind}
          seconds={activeTimerSeconds}
          workoutName={activeTimerSource.workoutName}
          exerciseName={activeTimerSource.exerciseName}
          scope={activeTimerSource.scope}
          onOpen={openActiveTimerExercise}
        />
      )}

      {screen === 'home' && (
        <HomeScreen
          workoutDays={workoutDays || []}
          onStartWorkout={(workout) => {
            setSelectedWorkout(workout);
            if (!activeWorkoutSessionId) {
              setActiveWorkoutSessionId(workout.id);
              resetWorkoutRuntimeState();
            } else if (activeWorkoutSessionId !== workout.id) {
              setActiveWorkoutSessionId(workout.id);
              resetWorkoutRuntimeState();
            }
            setScreen('workout');
          }}
          onEditWorkout={(workout) => {
            setSelectedWorkout(workout);
            setScreen('editWorkout');
          }}
          onAddWorkout={() => setScreen('addWorkout')}
          onDeleteWorkout={deleteWorkoutDay}
        />
      )}
      
      {screen === 'workout' && selectedWorkout && (
        <WorkoutScreen
            workout={selectedWorkout}
            exercises={exercises || []}
            selectedExercise={selectedExercise}
            onSelectExercise={(exercise) => {
              const isReturningToActiveExercise =
                exercise &&
                activeExerciseId === exercise.id &&
                (isSetActive || (isRestActive && restContext === 'set') || (isRestAlarmActive && restContext === 'set'));

              if (isReturningToActiveExercise) {
                setSelectedExercise(exercise);
                return;
              }

              setSelectedExercise(exercise);
              setIsRestActive(false);
              setIsRestAlarmActive(false);
              setCompletedSetIndex(null);
              setRestTimer(0);
              setRestDuration(0);
              setRestContext(null);
              if (exercise) {
                setExerciseRestReady(null);
              }
            }}
            onBack={() => {
              if (selectedExercise) {
                setSelectedExercise(null);
                if (isSetActive || isRestActive || isRestAlarmActive) {
                  return;
                }

                setCurrentSetIndex(null);
                setCompletedSetIndex(null);
                setIsSetActive(false);
                setIsRestActive(false);
                setExerciseTimer(0);
                setActiveExerciseId(null);
                setRestTimer(0);
                setRestDuration(0);
                setRestContext(null);
                setIsRestAlarmActive(false);
                return;
              }

              setScreen('home');
            }}
            onStartSet={(exercise, setIndex) => {
              setSelectedExercise(exercise);
              setCurrentSetIndex(setIndex);
              setIsSetActive(true);
              setIsRestActive(false);
              setIsRestAlarmActive(false);
              setCompletedSetIndex(null);
              setRestTimer(0);
              setRestDuration(0);
              setRestContext(null);
              setActiveExerciseId(exercise.id);
              setExerciseTimer(0);
              setActiveTimerSource(createTimerSource(selectedWorkout, exercise));
            }}
            onStartRest={(exercise) => startRestTimerForExercise(exercise)}
            onStartExerciseRest={startRestTimerBetweenExercises}
            onSkipRest={skipRest}
            onStopRestAlarm={stopRestAlarm}
            currentSetIndex={currentSetIndex}
            completedSetIndex={completedSetIndex}
            isSetActive={isSetActive}
            exerciseTimer={exerciseTimer}
            activeExerciseId={activeExerciseId}
            restTimer={restTimer}
            restDuration={restDuration}
            isRestActive={isRestActive}
            restContext={restContext}
            isRestAlarmActive={isRestAlarmActive}
            exerciseRestReady={exerciseRestReady}
            onMarkSetComplete={markSetComplete}
            onCancelSet={cancelSet}
            onResetExercise={resetExercise}
            onUpdateSetField={updateExerciseSetField}
            onFinishWorkout={() => setIsWorkoutFinishing(true)}
            isWorkoutFinishing={isWorkoutFinishing}
          />
      )}
      
      {screen === 'editWorkout' && selectedWorkout && (
        <EditWorkoutScreen
          workout={selectedWorkout}
          exercises={exercises || []}
          onBack={() => setScreen('home')}
          onUpdateWorkoutRestTime={updateWorkoutDayRestTime}
          onDeleteWorkout={deleteWorkoutDay}
          onAddExercise={() => setScreen('addExercise')}
          onEditExercise={(exercise) => {
            setSelectedExercise(exercise);
            setScreen('editExercise');
          }}
          onDeleteExercise={deleteExercise}
        />
      )}
      
      {screen === 'addWorkout' && (
        <AddEditWorkoutScreen
          onSave={(name, exerciseRestTime) => addWorkoutDay(name, exerciseRestTime)}
          onBack={() => setScreen('home')}
        />
      )}
      
      {screen === 'addExercise' && (
        <AddEditExerciseScreen
          onSave={addExercise}
          onBack={() => setScreen('editWorkout')}
        />
      )}
      
      {screen === 'editExercise' && selectedExercise && (
        <AddEditExerciseScreen
          isEdit={true}
          exercise={selectedExercise}
          onSave={(id, name, sets, restTime) => updateExercise(id, name, sets, restTime)}
          onBack={() => setScreen('editWorkout')}
        />
      )}
    </div>
  );
}

function SplashScreen({ isLeaving }) {
  const titleLines = [
    { text: 'в Фитнес', baseDelay: 120 },
    { text: 'трекер', baseDelay: 360 },
  ];

  return (
    <div className={`splash-screen flex min-h-screen items-center justify-center px-6 ${isLeaving ? 'splash-screen-leaving' : ''}`}>
      <div className="text-center">
        <div className={`splash-kicker text-sm font-medium uppercase tracking-[0.45em] text-blue-200/80 ${isLeaving ? 'splash-kicker-leaving' : ''}`}>
          Добро пожаловать
        </div>
        <div className={`splash-title mt-5 text-4xl font-bold text-white sm:text-5xl ${isLeaving ? 'splash-title-leaving' : ''}`}>
          {titleLines.map((line) => (
            <span key={line.text} className="splash-title-line" aria-label={line.text}>
              {Array.from(line.text).map((char, index) => {
                const letterDelay = line.baseDelay + index * 45;

                return (
                  <span
                    key={`${line.text}-${index}`}
                    className={`splash-letter ${char === ' ' ? 'splash-letter-space' : ''}`}
                    style={{
                      animationDelay: `${letterDelay}ms, ${letterDelay + 1050}ms`,
                    }}
                  >
                    {char === ' ' ? '\u00A0' : char}
                  </span>
                );
              })}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function HomeScreen({ workoutDays, onStartWorkout, onEditWorkout, onAddWorkout, onDeleteWorkout }) {
  return (
    <div className="screen-fade-in min-h-screen px-4 pt-4">
      <div className="mx-auto max-w-2xl">
      <div className="content-rise-in flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Тренировки</h1>
        <button
          onClick={onAddWorkout}
          className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white p-3 rounded-full shadow-lg shadow-orange-500/30 transition-all hover:scale-105 active:scale-95"
        >
          <Plus size={24} />
        </button>
      </div>
      
      <div className="space-y-8 pt-[8vh]">
        {workoutDays.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg mb-2">Нет тренировок</p>
            <p className="text-sm">Нажмите + чтобы добавить</p>
          </div>
        ) : (
          workoutDays.map((workout, index) => (
            <div
              key={workout.id}
              className="content-rise-in bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-[2rem] px-6 py-5 hover:border-white/20 transition-all shadow-lg shadow-black/20"
              style={{ animationDelay: `${120 + index * 70}ms` }}
            >
              <div className="flex min-h-[120px] flex-col justify-between gap-4">
                <div className="flex items-center justify-center">
                  <h2 className="text-center text-3xl font-semibold text-white">{workout.name}</h2>
                </div>
                <div className="flex items-end justify-between">
                  <button
                    onClick={() => onEditWorkout(workout)}
                    className="rounded-2xl border border-white/10 bg-slate-950/30 p-3 text-gray-300 transition-all hover:border-white/20 hover:text-white"
                    title="Редактировать"
                  >
                    <Settings size={22} />
                  </button>
                  <button
                    onClick={() => onStartWorkout(workout)}
                    className="min-w-[152px] justify-center bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white px-6 py-3 rounded-2xl text-base font-semibold transition-all hover:scale-105 active:scale-95 flex items-center gap-2 shadow-lg shadow-orange-500/25"
                  >
                    <Activity size={18} />
                    Начать
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      </div>
    </div>
  );
}

function formatTimer(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function ActiveTimerNotch({ timerKind, seconds, workoutName, exerciseName, scope, onOpen }) {
  const accentClass =
    timerKind === 'set'
      ? 'border-orange-400/35 bg-orange-500/12 text-orange-200 shadow-orange-500/20'
      : timerKind === 'alarm'
        ? 'border-red-400/35 bg-red-500/12 text-red-200 shadow-red-500/20'
        : 'border-cyan-400/35 bg-cyan-500/12 text-cyan-200 shadow-cyan-500/20';
  const label =
    scope === 'workout'
      ? (timerKind === 'alarm' ? 'Отдых между упражнениями окончен' : 'Отдых между упражнениями')
      : timerKind === 'set'
        ? 'Подход идет'
        : timerKind === 'alarm'
          ? 'Отдых окончен'
          : 'Идет отдых';
  const timerValue = timerKind === 'alarm' ? '0:00' : formatTimer(seconds);
  const title = scope === 'workout' ? 'Открыть список упражнений' : exerciseName;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`fixed left-1/2 z-40 flex w-[min(92vw,25rem)] -translate-x-1/2 items-center gap-3 rounded-t-[1.65rem] border px-4 py-3 text-left backdrop-blur-xl shadow-2xl transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] ${accentClass}`}
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6px)',
        transform: 'translate3d(-50%, 0, 0)',
      }}
    >
      <div className={`h-2.5 w-2.5 flex-none rounded-full ${timerKind === 'set' ? 'bg-orange-400' : timerKind === 'alarm' ? 'bg-red-400 animate-pulse' : 'bg-cyan-400'}`} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[11px] font-semibold uppercase tracking-[0.24em] text-white/75">
          {label}
        </div>
        <div className="truncate text-sm font-semibold text-white">
          {title}
        </div>
        <div className="truncate text-xs text-white/60">
          {workoutName}
        </div>
      </div>
      <div className="rounded-full border border-white/10 bg-slate-950/35 px-3 py-1.5 text-lg font-bold tabular-nums text-white">
        {timerValue}
      </div>
    </button>
  );
}

function WorkoutScreen({
  workout,
  exercises,
  selectedExercise,
  onSelectExercise,
  onBack,
  onStartSet,
  onStartRest,
  onStartExerciseRest,
  onSkipRest,
  onStopRestAlarm,
  currentSetIndex,
  completedSetIndex,
  isSetActive,
  exerciseTimer,
  activeExerciseId,
  restTimer,
  restDuration,
  isRestActive,
  restContext,
  isRestAlarmActive,
  exerciseRestReady,
  onMarkSetComplete,
  onCancelSet,
  onResetExercise,
  onUpdateSetField,
  onFinishWorkout,
  isWorkoutFinishing,
}) {
  const [setValueDrafts, setSetValueDrafts] = useState({});
  const [editingField, setEditingField] = useState(null);
  const scrollContainerRef = useRef(null);
  const exercisesListRef = useRef(null);
  const selectedExerciseCardRef = useRef(null);
  const actionPanelRef = useRef(null);
  const [timerLayout, setTimerLayout] = useState({
    top: 164,
    bottom: 136,
    size: 288,
  });
  const { handlers: swipeBackHandlers, style: swipeBackStyle } = useSwipeBack(true, onBack);
  const completedExercises = exercises.filter(e => e.sets.every(s => s.completed)).length;
  const allCompleted = completedExercises === exercises.length && exercises.length > 0;
  const activeRestDuration = restDuration || (restContext === 'exercise' ? workout.exerciseRestTime : selectedExercise?.restTime || 120);
  const showExerciseTimer = Boolean(
    isSetActive &&
    currentSetIndex !== null &&
    selectedExercise &&
    activeExerciseId === selectedExercise.id
  );
  const showRestTimerPanel = isRestActive || isRestAlarmActive;
  const showTimerPanel = showExerciseTimer || showRestTimerPanel;

  const getCurrentAction = () => {
    if (isRestAlarmActive) {
      return {
        type: 'stop_alarm',
        label: 'Остановить сигнал',
        color: 'from-red-500 to-red-600',
        data: null,
      };
    }

    if (isRestActive) {
      return {
        type: 'skip_rest',
        label: 'Пропустить отдых',
        color: 'from-slate-500 to-slate-600',
        data: null
      };
    }

    if (selectedExercise) {
      const firstIncompleteIndex = selectedExercise.sets.findIndex(s => !s.completed);

      if (isSetActive && currentSetIndex !== null) {
        return {
          type: 'complete_set',
          label: 'Закончить',
          color: 'from-green-500 to-green-600',
          data: { exercise: selectedExercise, index: currentSetIndex }
        };
      }

      if (completedSetIndex !== null && completedSetIndex !== selectedExercise.sets.length - 1) {
        return {
          type: 'start_rest',
          label: 'Начать отдых',
          color: 'from-blue-500 to-blue-600',
          data: { exercise: selectedExercise }
        };
      }

      if (firstIncompleteIndex !== -1 && completedSetIndex === null) {
        return {
          type: 'start_set',
          label: 'Начать',
          color: 'from-orange-500 to-orange-600',
          data: { exercise: selectedExercise, index: firstIncompleteIndex }
        };
      }
    }

    if (exerciseRestReady && !allCompleted) {
      return {
        type: 'start_exercise_rest',
        label: 'Начать отдых',
        color: 'from-cyan-500 to-blue-600',
        data: null,
      };
    }

    return null;
  };

  const currentAction = getCurrentAction();
  const timerLabel = restContext === 'exercise' ? 'Между упражнениями' : 'Отдых';
  const timerProgress = Math.max(0, Math.min((activeRestDuration - restTimer) / activeRestDuration, 1));
  const timerRadius = 96;
  const timerCircumference = 2 * Math.PI * timerRadius;
  const timerOffset = timerCircumference * (1 - timerProgress);
  const timerStroke = restContext === 'exercise' ? '#38BDF8' : '#60A5FA';
  const timerGlow = restContext === 'exercise'
    ? 'shadow-[0_0_45px_rgba(56,189,248,0.28)]'
    : 'shadow-[0_0_45px_rgba(96,165,250,0.28)]';
  const primaryButtonClass =
    'rounded-2xl py-4 text-base font-semibold text-white shadow-lg transition-all active:scale-[0.98]';
  const secondaryButtonClass =
    'rounded-2xl border py-4 text-base font-semibold shadow-lg transition-all active:scale-[0.98]';
  const screenContentPaddingClass = showTimerPanel ? 'pb-[34rem]' : 'pb-40';
  const selectedExerciseBodyClass = showTimerPanel
    ? 'max-h-[320px]'
    : 'max-h-[calc(100vh-14rem)]';
  const timerPanelClass = showTimerPanel
    ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
    : 'pointer-events-none translate-y-8 scale-95 opacity-0';
  const showFinishWorkoutButton = allCompleted && !selectedExercise && !isWorkoutFinishing;
  const isExerciseSelectionLocked = isSetActive || isRestActive || isRestAlarmActive || Boolean(exerciseRestReady);
  const timerInnerSize = Math.max(144, Math.round(timerLayout.size * 0.61));

  useEffect(() => {
    if (!selectedExercise) {
      setSetValueDrafts({});
      setEditingField(null);
      return;
    }

    setSetValueDrafts(
      selectedExercise.sets.reduce((accumulator, set, index) => {
        accumulator[index] = {
          weight: String(set.weight ?? 0),
          reps: String(set.reps ?? 0),
        };
        return accumulator;
      }, {})
    );
  }, [selectedExercise]);

  useEffect(() => {
    if (!showTimerPanel) {
      return;
    }

    let frameId = null;

    const updateTimerLayout = () => {
      const viewportHeight = window.innerHeight;
      const actionRect = actionPanelRef.current?.getBoundingClientRect();
      const selectedRect = selectedExerciseCardRef.current?.getBoundingClientRect();
      const listRect = exercisesListRef.current?.getBoundingClientRect();

      const panelTop = actionRect?.top ?? viewportHeight - 124;
      const anchorBottom = selectedRect?.bottom ?? listRect?.top ?? viewportHeight * 0.28;
      const top = Math.max(138, Math.min(anchorBottom + 18, viewportHeight * 0.58));
      const bottom = Math.max(96, viewportHeight - panelTop + 18);
      const availableHeight = Math.max(184, panelTop - top - 12);
      const size = Math.max(184, Math.min(288, availableHeight - 8));

      setTimerLayout({ top, bottom, size });
    };

    const scheduleUpdate = () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(updateTimerLayout);
    };

    scheduleUpdate();
    window.addEventListener('resize', scheduleUpdate);

    const scrollElement = scrollContainerRef.current;
    scrollElement?.addEventListener('scroll', scheduleUpdate, { passive: true });

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener('resize', scheduleUpdate);
      scrollElement?.removeEventListener('scroll', scheduleUpdate);
    };
  }, [showTimerPanel, selectedExercise?.id, currentSetIndex, isRestActive, isRestAlarmActive, exerciseRestReady]);

  const getDraftValue = (index, field, fallbackValue) => (
    setValueDrafts[index]?.[field] ?? String(fallbackValue ?? 0)
  );

  const handleDraftChange = (index, field, value) => {
    if (!/^\d*$/.test(value)) {
      return;
    }

    setSetValueDrafts((currentDrafts) => ({
      ...currentDrafts,
      [index]: {
        ...currentDrafts[index],
        [field]: value,
      },
    }));
  };

  const handleStartEditing = (index, field, fallbackValue) => {
    setSetValueDrafts((currentDrafts) => ({
      ...currentDrafts,
      [index]: {
        weight: currentDrafts[index]?.weight ?? String(selectedExercise?.sets[index]?.weight ?? 0),
        reps: currentDrafts[index]?.reps ?? String(selectedExercise?.sets[index]?.reps ?? 0),
        [field]: currentDrafts[index]?.[field] ?? String(fallbackValue ?? 0),
      },
    }));
    setEditingField({ index, field });
  };

  const handleCancelEditing = (index, field, fallbackValue) => {
    setSetValueDrafts((currentDrafts) => ({
      ...currentDrafts,
      [index]: {
        ...currentDrafts[index],
        [field]: String(fallbackValue ?? 0),
      },
    }));
    setEditingField(null);
  };

  const handleSaveSetField = async (exercise, index, field, fallbackValue) => {
    const rawValue = getDraftValue(index, field, fallbackValue);
    const parsedValue = Number(rawValue);
    const normalizedValue = field === 'reps'
      ? Math.max(1, Number.isNaN(parsedValue) ? 1 : parsedValue)
      : Math.max(0, Number.isNaN(parsedValue) ? 0 : parsedValue);

    setSetValueDrafts((currentDrafts) => ({
      ...currentDrafts,
      [index]: {
        ...currentDrafts[index],
        [field]: String(normalizedValue),
      },
    }));

    setEditingField(null);

    if (normalizedValue !== fallbackValue) {
      await onUpdateSetField(exercise, index, field, normalizedValue);
    }
  };

  const handleAction = () => {
    if (!currentAction) return;

    switch (currentAction.type) {
      case 'start_set':
        onStartSet(currentAction.data.exercise, currentAction.data.index);
        break;
      case 'complete_set':
        onMarkSetComplete(currentAction.data.exercise, currentAction.data.index);
        break;
      case 'start_rest':
        onStartRest(currentAction.data.exercise);
        break;
      case 'skip_rest':
        onSkipRest();
        break;
      case 'start_exercise_rest':
        onStartExerciseRest();
        break;
      case 'stop_alarm':
        onStopRestAlarm();
        break;
    }
  };

  return (
    <div
      {...swipeBackHandlers}
      className="screen-fade-in h-screen overflow-hidden flex flex-col transition-all duration-500"
      style={{ ...swipeBackStyle, touchAction: 'pan-y' }}
    >
      <div ref={scrollContainerRef} className={`p-4 flex-1 overflow-y-auto ${screenContentPaddingClass}`}>
        <div className="max-w-md mx-auto">
          <div className="content-rise-in flex items-center justify-between mb-6">
            <button
              onClick={onBack}
              className="text-gray-400 hover:text-white p-2 transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <h1 className="text-2xl font-bold text-white">{workout.name}</h1>
            <div className="w-10"></div>
          </div>

          {exerciseRestReady && !selectedExercise && !isRestActive && !isRestAlarmActive && (
            <div className="content-rise-in mb-4 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-cyan-200" style={{ animationDelay: '95ms' }}>
              Для дальнейшей тренеровки нужно отдохнуть.
            </div>
          )}

          <div ref={exercisesListRef} className="space-y-4">
            {exercises.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg">Нет упражнений</p>
                <p className="text-sm">Добавьте их в настройках тренировки</p>
              </div>
            ) : (
              exercises.map((exercise, exerciseIndex) => {
                const isSelected = selectedExercise?.id === exercise.id;
                const isActiveExercise = activeExerciseId === exercise.id;
                const allSetsCompleted = exercise.sets.every(s => s.completed);
                const showExercise = !selectedExercise || isSelected;
                const canOpenExercise = !isExerciseSelectionLocked || isActiveExercise;

                if (!showExercise) return null;

                return (
                  <div
                    key={exercise.id}
                    ref={isSelected ? selectedExerciseCardRef : null}
                    className={`content-rise-in bg-slate-900/60 backdrop-blur-md border rounded-2xl overflow-hidden transition-all shadow-lg shadow-black/20 ${
                      allSetsCompleted
                        ? 'border-green-500/50 shadow-[0_0_24px_rgba(34,197,94,0.12)]'
                        : isActiveExercise
                          ? 'border-cyan-400/70 bg-cyan-500/10 shadow-[0_0_28px_rgba(34,211,238,0.24)] ring-1 ring-cyan-300/20'
                        : isSelected
                          ? 'border-orange-500/50'
                          : 'border-white/10 hover:border-white/20'
                    }`}
                    style={{ animationDelay: `${110 + exerciseIndex * 70}ms` }}
                  >
                    <div className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {allSetsCompleted && <Check size={24} className="text-green-400" />}
                        <button
                          onClick={() => {
                            if (!canOpenExercise) {
                              return;
                            }

                            onSelectExercise(isSelected ? null : exercise);
                          }}
                          className={`text-left ${canOpenExercise ? '' : 'cursor-not-allowed opacity-60'}`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="text-xl font-semibold text-white">{exercise.name}</h2>
                            {isActiveExercise && (
                              <span className="rounded-full border border-cyan-300/35 bg-cyan-400/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200 shadow-[0_0_16px_rgba(34,211,238,0.18)]">
                                В процессе
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-400">
                            {exercise.sets.filter(s => s.completed).length}/{exercise.sets.length} подходов
                          </p>
                        </button>
                      </div>
                      {allSetsCompleted && (
                        <button
                          onClick={() => onResetExercise(exercise)}
                          className="text-orange-400 hover:text-orange-300 p-2 transition-colors"
                          title="Сбросить прогресс"
                        >
                          <RotateCcw size={20} />
                        </button>
                      )}
                    </div>

                    {isSelected && (
                      <div className="content-rise-in px-4 pb-4 transition-all duration-500" style={{ animationDelay: '120ms' }}>
                        <div className={`hide-scrollbar space-y-3 overflow-y-auto pr-1 overscroll-y-contain transition-all duration-500 ${selectedExerciseBodyClass}`}>
                          {exercise.sets.map((set, index) => {
                          const isCurrentSet = currentSetIndex === index;
                          const isSetComplete = set.completed;

                          return (
                            <div
                              key={index}
                              className={`content-rise-in p-4 rounded-xl border-2 transition-all ${
                                isSetComplete
                                  ? 'bg-green-500/20 border-green-500/50'
                                  : isCurrentSet
                                    ? 'bg-orange-500/20 border-orange-500/50'
                                    : 'bg-slate-800/50 border-white/10'
                              }`}
                              style={{ animationDelay: `${160 + index * 60}ms` }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-base font-semibold text-white">
                                      {index + 1}-ый Подход
                                    </div>
                                    <div className="ml-2 flex flex-wrap gap-2">
                                      {[
                                        { field: 'reps', label: 'Повторения', suffix: 'раз', value: set.reps },
                                        { field: 'weight', label: 'Вес', suffix: 'кг', value: set.weight },
                                      ].map((item) => {
                                        const isEditingCurrentField =
                                          editingField?.index === index && editingField?.field === item.field;

                                        return (
                                          <div
                                            key={`${index}-${item.field}`}
                                            className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2"
                                          >
                                            <span className="block text-xs uppercase tracking-wide text-gray-400">{item.label}</span>
                                            {isEditingCurrentField ? (
                                              <input
                                                autoFocus
                                                type="text"
                                                inputMode="numeric"
                                                value={getDraftValue(index, item.field, item.value)}
                                                onChange={(event) => handleDraftChange(index, item.field, event.target.value)}
                                                onBlur={() => handleSaveSetField(exercise, index, item.field, item.value)}
                                                onKeyDown={(event) => {
                                                  if (event.key === 'Enter') {
                                                    event.currentTarget.blur();
                                                  }

                                                  if (event.key === 'Escape') {
                                                    handleCancelEditing(index, item.field, item.value);
                                                  }
                                                }}
                                                className="mt-1 block w-[84px] border-none bg-transparent p-0 text-sm font-semibold text-white outline-none"
                                              />
                                            ) : (
                                              <button
                                                type="button"
                                                onClick={() => handleStartEditing(index, item.field, item.value)}
                                                className="mt-1 block text-left text-sm font-semibold text-white transition-opacity hover:opacity-80"
                                              >
                                                {item.value} {item.suffix}
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                                {isSetComplete && <Check size={20} className="text-green-400" />}
                              </div>

                            </div>
                          );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {isWorkoutFinishing && (
        <div className="celebration-overlay fixed inset-0 z-30 flex items-center justify-center px-6">
          <div className="celebration-card w-full max-w-sm rounded-[2rem] border border-green-400/30 bg-slate-900/80 px-6 py-8 text-center shadow-2xl shadow-green-500/20 backdrop-blur-xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20 text-green-300">
              <Check size={32} />
            </div>
            <h2 className="mt-5 text-3xl font-bold text-white">Поздравляю!</h2>
            <p className="mt-3 text-base text-green-200">Тренировка завершена</p>
          </div>
        </div>
      )}

      <div
        className={`fixed left-0 right-0 z-10 px-4 transition-all duration-500 ease-out ${timerPanelClass}`}
        style={{
          top: `${timerLayout.top}px`,
          bottom: `${timerLayout.bottom}px`,
        }}
      >
          <div className="max-w-md mx-auto flex h-full items-center justify-center">
            {showRestTimerPanel ? (
              <button
                type="button"
                onClick={isRestAlarmActive ? onStopRestAlarm : undefined}
                className={`relative flex items-center justify-center rounded-full overflow-hidden transition-[width,height] duration-500 ease-out ${timerGlow} ${isRestAlarmActive ? 'cursor-pointer animate-pulse' : ''}`}
                style={{ width: `${timerLayout.size}px`, height: `${timerLayout.size}px` }}
              >
                <svg
                  className="absolute inset-0 h-full w-full -rotate-90 rounded-full"
                  viewBox="0 0 220 220"
                >
                  <circle
                    cx="110"
                    cy="110"
                    r="96"
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.14)"
                    strokeWidth="14"
                  />
                  <circle
                    cx="110"
                    cy="110"
                    r="96"
                    fill="none"
                    stroke={restContext === 'exercise' ? 'rgba(56, 189, 248, 0.16)' : 'rgba(96, 165, 250, 0.16)'}
                    strokeWidth="24"
                  />
                  <circle
                    cx="110"
                    cy="110"
                    r="96"
                    fill="none"
                    stroke={timerStroke}
                    strokeWidth="16"
                    strokeLinecap="round"
                    strokeDasharray={timerCircumference}
                    strokeDashoffset={timerOffset}
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <div
                  className="flex flex-col items-center justify-center rounded-full border border-white/10 bg-[#071121]/95 px-5 text-center shadow-inner shadow-black/50 transition-[width,height] duration-500 ease-out"
                  style={{ width: `${timerInnerSize}px`, height: `${timerInnerSize}px` }}
                >
                  <span className={`text-[11px] font-semibold uppercase tracking-[0.28em] ${restContext === 'exercise' ? 'text-cyan-300' : 'text-blue-300'}`}>
                    {isRestAlarmActive ? 'Таймер окончен' : timerLabel}
                  </span>
                  <span className="mt-3 text-6xl font-bold text-white tabular-nums">
                    {formatTimer(restTimer)}
                  </span>
                  {isRestAlarmActive && (
                    <span className="mt-3 text-xs font-medium text-blue-100/80">
                      Нажми на таймер или кнопку стоп
                    </span>
                  )}
                </div>
              </button>
            ) : (
              <div
                className="rounded-[2rem] border border-orange-400/20 bg-slate-900/75 px-6 py-5 text-center shadow-2xl shadow-orange-500/10 backdrop-blur-xl transition-[width] duration-500 ease-out"
                style={{ width: `${Math.min(384, Math.max(280, timerLayout.size + 48))}px` }}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.32em] text-orange-300">
                  Подход
                </div>
                <div className="mt-3 text-xl font-semibold text-white">
                  {currentSetIndex !== null ? `${currentSetIndex + 1}-ый подход` : selectedExercise?.name}
                </div>
                <div className="mt-5 text-6xl font-bold text-white tabular-nums">
                  {formatTimer(exerciseTimer)}
                </div>
                <div className="mt-3 text-sm text-orange-100/70">
                  Прошло с начала подхода
                </div>
              </div>
            )}
          </div>
        </div>

      {(currentAction || showFinishWorkoutButton) && (
        <div ref={actionPanelRef} className="fixed bottom-0 left-0 right-0 z-20 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0B1528] via-[#0B1528] to-transparent">
          <div className="max-w-md mx-auto">
            {showFinishWorkoutButton ? (
              <button
                onClick={onFinishWorkout}
                className={`${primaryButtonClass} w-full bg-gradient-to-r from-green-500 to-green-600 hover:opacity-90`}
              >
                Завершить тренировку
              </button>
            ) : isSetActive ? (
              <div className="flex items-stretch gap-3">
                <button
                  onClick={() => selectedExercise && onCancelSet(selectedExercise, currentSetIndex)}
                  className={`${secondaryButtonClass} w-[28%] min-w-[88px] max-w-[112px] border-red-500/30 bg-red-500/20 px-3 text-red-300 hover:bg-red-500/30`}
                >
                  Отмена
                </button>
                <button
                  onClick={handleAction}
                  className={`${primaryButtonClass} flex-1 bg-gradient-to-r ${currentAction.color} hover:opacity-90`}
                >
                  {currentAction.label}
                </button>
              </div>
            ) : (
              <button
                onClick={handleAction}
                className={`${primaryButtonClass} w-full bg-gradient-to-r ${currentAction.color} hover:opacity-90`}
              >
                <span className="flex items-center justify-center gap-2">
                  {currentAction.type === 'stop_alarm' && <Square size={18} />}
                  {currentAction.label}
                </span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EditWorkoutScreen({
  workout,
  exercises,
  onBack,
  onUpdateWorkoutRestTime,
  onDeleteWorkout,
  onAddExercise,
  onEditExercise,
  onDeleteExercise,
}) {
  const { handlers: swipeBackHandlers, style: swipeBackStyle } = useSwipeBack(true, onBack);
  const [exerciseRestTimeInput, setExerciseRestTimeInput] = useState(String(workout.exerciseRestTime || 180));

  useEffect(() => {
    setExerciseRestTimeInput(String(workout.exerciseRestTime || 180));
  }, [workout]);

  const handleWorkoutRestBlur = async () => {
    const parsedValue = Number(exerciseRestTimeInput);
    const normalizedValue = Math.max(10, Math.min(900, Number.isNaN(parsedValue) ? workout.exerciseRestTime || 180 : parsedValue));
    setExerciseRestTimeInput(String(normalizedValue));
    await onUpdateWorkoutRestTime(workout.id, normalizedValue);
  };

  return (
    <div
      {...swipeBackHandlers}
      className="screen-fade-in flex min-h-screen flex-col p-4 max-w-md mx-auto pb-[calc(1rem+env(safe-area-inset-bottom))]"
      style={{ ...swipeBackStyle, touchAction: 'pan-y' }}
    >
      <div className="content-rise-in flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white p-2 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-white">Настройки: {workout.name}</h1>
        <button
          onClick={onAddExercise}
          className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white p-3 rounded-full transition-all hover:scale-105 active:scale-95 shadow-lg shadow-orange-500/30"
        >
          <Plus size={24} />
        </button>
      </div>

      <div className="space-y-4">
        <div className="content-rise-in bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-4" style={{ animationDelay: '90ms' }}>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Отдых между упражнениями (секунд)
          </label>
          <input
            type="number"
            value={exerciseRestTimeInput}
            onChange={(event) => setExerciseRestTimeInput(event.target.value)}
            onBlur={handleWorkoutRestBlur}
            min="10"
            max="900"
            className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
          />
        </div>

        <button
          onClick={() => {
            if (confirm(`Удалить день "${workout.name}" целиком?`)) {
              onDeleteWorkout(workout.id);
            }
          }}
          className="content-rise-in w-full rounded-2xl border border-red-500/30 bg-red-500/15 py-3 text-base font-semibold text-red-300 transition-all hover:bg-red-500/25 active:scale-[0.98]"
          style={{ animationDelay: '100ms' }}
        >
          Удалить день
        </button>

        {exercises.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-lg">Нет упражнений</p>
            <p className="text-sm">Нажмите + чтобы добавить</p>
          </div>
        ) : (
          exercises.map((exercise, index) => (
            <div
              key={exercise.id}
              className="content-rise-in bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-4 flex items-center justify-between hover:border-white/20 transition-all shadow-lg shadow-black/20"
              style={{ animationDelay: `${120 + index * 70}ms` }}
            >
              <div className="flex-1">
                <h2 className="text-xl font-semibold text-white">{exercise.name}</h2>
                <p className="text-sm text-gray-400">
                  {exercise.sets.length} подходов
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onEditExercise(exercise)}
                  className="text-gray-400 hover:text-white p-2 transition-colors"
                >
                  <Edit2 size={20} />
                </button>
                <button
                  onClick={() => {
                    if (confirm('Удалить упражнение?')) {
                      onDeleteExercise(exercise.id);
                    }
                  }}
                  className="text-red-400 hover:text-red-300 p-2 transition-colors"
                >
                  <Trash2 size={20} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function AddEditWorkoutScreen({ isEdit, onSave, onBack }) {
  const [name, setName] = useState('');
  const [exerciseRestTime, setExerciseRestTime] = useState(180);
  const { handlers: swipeBackHandlers, style: swipeBackStyle } = useSwipeBack(true, onBack);

  return (
    <div
      {...swipeBackHandlers}
      className="screen-fade-in mx-auto flex min-h-screen max-w-md flex-col p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      style={{ ...swipeBackStyle, touchAction: 'pan-y' }}
    >
      <div className="content-rise-in flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white p-2 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-white">{isEdit ? 'Редактировать' : 'Добавить тренировку'}</h1>
        <div className="w-10"></div>
      </div>

      <div className="flex flex-1 items-center">
        <div className="w-full space-y-4 -translate-y-[30%]">
          <div className="content-rise-in overflow-hidden rounded-2xl bg-slate-900/60 p-4 ring-1 ring-inset ring-white/10 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" style={{ animationDelay: '100ms' }}>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Название тренировки
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
              placeholder="Например: День ног"
            />
          </div>

          <div className="content-rise-in overflow-hidden rounded-2xl bg-slate-900/60 p-4 ring-1 ring-inset ring-white/10 backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]" style={{ animationDelay: '150ms' }}>
            <label className="block text-sm font-semibold text-gray-300 mb-2">
              Отдых между упражнениями (секунд)
            </label>
            <input
              type="number"
              value={exerciseRestTime}
              onChange={(e) => setExerciseRestTime(Number(e.target.value))}
              min="10"
              max="900"
              className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
            />
          </div>

          <button
            onClick={() => {
              if (name.trim()) {
                onSave(name.trim(), Math.max(10, Math.min(900, Number(exerciseRestTime) || 180)));
              }
            }}
            disabled={!name.trim()}
            className="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-orange-500/30"
          >
            Сохранить
          </button>
        </div>
      </div>
    </div>
  );
}

function AddEditExerciseScreen({
  isEdit,
  exercise,
  onSave,
  onBack,
}) {
  const initialSets = isEdit ? normalizeSets(exercise?.sets) : Array.from({ length: 3 }, () => createEmptySet());
  const [name, setName] = useState(isEdit ? exercise?.name || '' : '');
  const [setCountInput, setSetCountInput] = useState(String(initialSets.length));
  const [restTime, setRestTime] = useState(isEdit && exercise?.restTime ? exercise.restTime : 120);
  const [sets, setSets] = useState(
    initialSets
  );
  const { handlers: swipeBackHandlers, style: swipeBackStyle } = useSwipeBack(true, onBack);

  const resizeSets = (count) => {
    const newCount = Math.max(1, Math.min(20, count));
    if (newCount > sets.length) {
      const newSets = [...sets];
      const lastSet = sets[sets.length - 1] || { weight: 0, reps: 0, completed: false };
      for (let i = sets.length; i < newCount; i++) {
        newSets.push({ ...lastSet, completed: false });
      }
      setSets(newSets);
    } else {
      setSets(sets.slice(0, newCount));
    }
  };

  const handleSetCountChange = (value) => {
    setSetCountInput(value);

    if (value === '') {
      return;
    }

    const parsedValue = Number(value);
    if (Number.isNaN(parsedValue)) {
      return;
    }

    const normalizedCount = Math.max(1, Math.min(20, parsedValue));
    resizeSets(normalizedCount);
  };

  const handleSetCountBlur = () => {
    if (setCountInput === '') {
      setSetCountInput(String(sets.length || 1));
      return;
    }

    const parsedValue = Number(setCountInput);
    const normalizedCount = Math.max(1, Math.min(20, Number.isNaN(parsedValue) ? sets.length || 1 : parsedValue));
    resizeSets(normalizedCount);
    setSetCountInput(String(normalizedCount));
  };

  const updateSet = (index, field, value) => {
    const newSets = [...sets];
    newSets[index] = { ...newSets[index], [field]: value };
    
    if (field === 'weight' || field === 'reps') {
      const lastValue = value;
      for (let i = index + 1; i < newSets.length; i++) {
        newSets[i] = { ...newSets[i], [field]: lastValue };
      }
    }
    
    setSets(newSets);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    if (isEdit) {
      onSave(exercise?.id, name.trim(), sets, restTime);
      return;
    }

    onSave(name.trim(), sets, restTime);
  };

  return (
    <div
      {...swipeBackHandlers}
      className="screen-fade-in p-4 max-w-md mx-auto pb-[calc(1rem+env(safe-area-inset-bottom))]"
      style={{ ...swipeBackStyle, touchAction: 'pan-y' }}
    >
      <div className="content-rise-in flex items-center justify-between mb-6">
        <button
          onClick={onBack}
          className="text-gray-400 hover:text-white p-2 transition-colors"
        >
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-2xl font-bold text-white">
          {isEdit ? 'Редактировать' : 'Добавить упражнение'}
        </h1>
        <div className="w-10"></div>
      </div>

      <div className="space-y-4">
        <div className="content-rise-in bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-4" style={{ animationDelay: '90ms' }}>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Название упражнения
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
            placeholder="Например: Тяга верхнего блока"
          />
        </div>

        <div className="content-rise-in bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-4" style={{ animationDelay: '140ms' }}>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Количество подходов
          </label>
          <input
            type="number"
            value={setCountInput}
            onChange={(e) => handleSetCountChange(e.target.value)}
            onBlur={handleSetCountBlur}
            min="1"
            max="20"
            className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
          />
        </div>

        <div className="content-rise-in bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-4" style={{ animationDelay: '190ms' }}>
          <label className="block text-sm font-semibold text-gray-300 mb-2">
            Время отдыха между подходами (секунд)
          </label>
          <input
            type="number"
            value={restTime}
            onChange={(e) => setRestTime(Number(e.target.value))}
            min="10"
            max="300"
            className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
          />
        </div>

        {sets.map((set, index) => (
          <div
            key={index}
            className="content-rise-in bg-slate-900/60 backdrop-blur-md border border-white/10 rounded-2xl p-4"
            style={{ animationDelay: `${240 + index * 55}ms` }}
          >
            <h3 className="text-lg font-semibold text-white mb-3">Подход {index + 1}</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Вес (кг)
                </label>
                <input
                  type="number"
                  value={set.weight}
                  onChange={(e) => updateSet(index, 'weight', Number(e.target.value))}
                  min="0"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Повторения
                </label>
                <input
                  type="number"
                  value={set.reps}
                  onChange={(e) => updateSet(index, 'reps', Number(e.target.value))}
                  min="1"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-white/10 rounded-lg text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                />
              </div>
            </div>
          </div>
        ))}

        <button
          onClick={handleSave}
          disabled={!name.trim()}
          className="content-rise-in w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white py-3 rounded-xl font-semibold transition-all hover:scale-105 active:scale-95 shadow-lg shadow-orange-500/30"
          style={{ animationDelay: `${260 + sets.length * 55}ms` }}
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}

export default App;
