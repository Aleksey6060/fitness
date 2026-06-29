import React, { useState, useEffect, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, ArrowLeft, Trash2, Edit2, Check, RotateCcw, Settings, Activity } from 'lucide-react';
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

function useSwipeBack(enabled, onBack) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwipeDragging, setIsSwipeDragging] = useState(false);
  const gestureStateRef = useRef({
    tracking: false,
    startX: 0,
    startY: 0,
  });

  const handleTouchStart = (event) => {
    if (!enabled) {
      return;
    }

    const touch = event.touches?.[0];
    if (!touch) {
      return;
    }

    gestureStateRef.current = {
      tracking: touch.clientX <= 36,
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
      setSwipeOffset(0);
      setIsSwipeDragging(false);
      return;
    }

    if (deltaY > 80 && deltaY > deltaX) {
      gestureStateRef.current.tracking = false;
      setSwipeOffset(0);
      setIsSwipeDragging(false);
      return;
    }

    setIsSwipeDragging(true);
    setSwipeOffset(Math.min(deltaX * 0.32, 44));
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

    if (deltaX > 90 && deltaY < 80 && deltaX > deltaY) {
      setSwipeOffset(0);
      window.requestAnimationFrame(() => {
        onBack();
      });
      return;
    }

    setSwipeOffset(0);
  };

  const handleTouchCancel = () => {
    gestureStateRef.current.tracking = false;
    setIsSwipeDragging(false);
    setSwipeOffset(0);
  };

  return {
    handlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    },
    style: {
      transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : 'translateX(0)',
      transition: isSwipeDragging
        ? 'none'
        : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1)',
    },
  };
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [isSplashLeaving, setIsSplashLeaving] = useState(false);
  const [screen, setScreen] = useState('home');
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [currentSetIndex, setCurrentSetIndex] = useState(null);
  const [completedSetIndex, setCompletedSetIndex] = useState(null);
  const [setTimer, setSetTimer] = useState(0);
  const [restTimer, setRestTimer] = useState(0);
  const [isSetActive, setIsSetActive] = useState(false);
  const [isRestActive, setIsRestActive] = useState(false);
  const [isWorkoutFinishing, setIsWorkoutFinishing] = useState(false);

  const workoutDays = useLiveQuery(() => db.workoutDays.toArray(), []);
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
    if (!selectedExercise || !Array.isArray(exercises)) {
      return;
    }

    const freshExercise = exercises.find((exercise) => exercise.id === selectedExercise.id);

    if (!freshExercise) {
      setSelectedExercise(null);
      return;
    }

    if (freshExercise !== selectedExercise) {
      setSelectedExercise(freshExercise);
    }
  }, [exercises, selectedExercise]);

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
      setSelectedWorkout(null);
      setSelectedExercise(null);
      setCurrentSetIndex(null);
      setCompletedSetIndex(null);
      setIsSetActive(false);
      setIsRestActive(false);
      setSetTimer(0);
      setRestTimer(0);
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

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.5;

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.error('Error playing beep:', error);
    }
  };

  useEffect(() => {
    let interval;
    if (isSetActive) {
      interval = setInterval(() => {
        setSetTimer(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSetActive]);

  useEffect(() => {
    let interval;
    if (isRestActive && restTimer > 0) {
      interval = setInterval(() => {
        setRestTimer(t => {
          if (t <= 1) {
            setIsRestActive(false);
            setCompletedSetIndex(null);
            playBeep();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRestActive, restTimer]);

  const addWorkoutDay = async (name) => {
    await db.workoutDays.add({ name, createdAt: Date.now() });
    setScreen('home');
  };

  const deleteWorkoutDay = async (id) => {
    await db.workoutDays.delete(id);
    await db.exercises.where('workoutDayId').equals(id).delete();
  };

  const markSetComplete = (exercise, setIndex) => {
    const updatedSets = [...exercise.sets];
    updatedSets[setIndex] = { ...updatedSets[setIndex], completed: true, completedAt: Date.now() };
    updateExercise(exercise.id, exercise.name, updatedSets, exercise.restTime, true);
    setIsSetActive(false);
    setSetTimer(0);

    const isLastSet = setIndex === exercise.sets.length - 1;
    const allSetsComplete = updatedSets.every(s => s.completed);

    if (isLastSet && allSetsComplete) {
      setCurrentSetIndex(null);
      setSelectedExercise(null);
    } else {
      setCurrentSetIndex(null);
      setCompletedSetIndex(setIndex);
    }
  };

  const cancelSet = (exercise, setIndex) => {
    setIsSetActive(false);
    setSetTimer(0);
    setCurrentSetIndex(null);
  };

  const startRestTimerForExercise = (exercise) => {
    const duration = exercise.restTime || 120;
    setRestTimer(duration);
    setIsRestActive(true);
  };

  const skipRest = () => {
    setIsRestActive(false);
    setRestTimer(0);
    setCompletedSetIndex(null);
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

  if (showSplash) {
    return <SplashScreen isLeaving={isSplashLeaving} />;
  }

  return (
    <div className="min-h-screen bg-[#0B1528] select-none overscroll-behavior-y-contain">
      {screen === 'home' && (
        <HomeScreen
          workoutDays={workoutDays || []}
          onStartWorkout={(workout) => {
            setSelectedWorkout(workout);
            setSelectedExercise(null);
            setCurrentSetIndex(null);
            setCompletedSetIndex(null);
            setIsSetActive(false);
            setIsRestActive(false);
            setSetTimer(0);
            setRestTimer(0);
            setIsWorkoutFinishing(false);
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
              setSelectedExercise(exercise);
              setIsRestActive(false);
              setCompletedSetIndex(null);
            }}
            onBack={() => {
              if (selectedExercise) {
                setSelectedExercise(null);
                setCurrentSetIndex(null);
                setCompletedSetIndex(null);
                setIsSetActive(false);
                setIsRestActive(false);
                setSetTimer(0);
                setRestTimer(0);
                return;
              }

              setScreen('home');
              setSelectedWorkout(null);
              setSelectedExercise(null);
              setIsSetActive(false);
              setIsRestActive(false);
              setSetTimer(0);
              setRestTimer(0);
              setCompletedSetIndex(null);
              setIsWorkoutFinishing(false);
            }}
            onStartSet={(exercise, setIndex) => {
              setSelectedExercise(exercise);
              setCurrentSetIndex(setIndex);
              setIsSetActive(true);
              setIsRestActive(false);
              setCompletedSetIndex(null);
            }}
            onStartRest={(exercise) => startRestTimerForExercise(exercise)}
            onSkipRest={skipRest}
            currentSetIndex={currentSetIndex}
            completedSetIndex={completedSetIndex}
            isSetActive={isSetActive}
            setTimer={setTimer}
            restTimer={restTimer}
            isRestActive={isRestActive}
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
          onSave={(name) => addWorkoutDay(name)}
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

function WorkoutScreen({
  workout,
  exercises,
  selectedExercise,
  onSelectExercise,
  onBack,
  onStartSet,
  onStartRest,
  onSkipRest,
  currentSetIndex,
  completedSetIndex,
  isSetActive,
  setTimer,
  restTimer,
  isRestActive,
  onMarkSetComplete,
  onCancelSet,
  onResetExercise,
  onUpdateSetField,
  onFinishWorkout,
  isWorkoutFinishing,
}) {
  const [setValueDrafts, setSetValueDrafts] = useState({});
  const [editingField, setEditingField] = useState(null);
  const { handlers: swipeBackHandlers, style: swipeBackStyle } = useSwipeBack(true, onBack);
  const completedExercises = exercises.filter(e => e.sets.every(s => s.completed)).length;
  const allCompleted = completedExercises === exercises.length && exercises.length > 0;
  const activeRestDuration = selectedExercise?.restTime || 120;
  const showTimerPanel = isSetActive || isRestActive;

  const getCurrentAction = () => {
    if (!selectedExercise) return null;

    const firstIncompleteIndex = selectedExercise.sets.findIndex(s => !s.completed);

    if (isSetActive && currentSetIndex !== null) {
      return {
        type: 'complete_set',
        label: 'Закончить',
        color: 'from-green-500 to-green-600',
        data: { exercise: selectedExercise, index: currentSetIndex }
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

    return null;
  };

  const currentAction = getCurrentAction();
  const timerLabel = isRestActive ? 'Отдых' : 'Подход';
  const timerValue = isRestActive ? restTimer : setTimer;
  const setProgress = Math.max(0, Math.min(setTimer / 60, 1));
  const timerProgress = isRestActive
    ? Math.max(0, Math.min((activeRestDuration - restTimer) / activeRestDuration, 1))
    : setProgress;
  const timerRadius = 96;
  const timerCircumference = 2 * Math.PI * timerRadius;
  const timerOffset = timerCircumference * (1 - timerProgress);
  const timerStroke = isRestActive ? '#60A5FA' : '#F97316';
  const timerGlow = isRestActive
    ? 'shadow-[0_0_45px_rgba(96,165,250,0.28)]'
    : 'shadow-[0_0_45px_rgba(249,115,22,0.28)]';
  const primaryButtonClass =
    'rounded-2xl py-4 text-base font-semibold text-white shadow-lg transition-all active:scale-[0.98]';
  const secondaryButtonClass =
    'rounded-2xl border py-4 text-base font-semibold shadow-lg transition-all active:scale-[0.98]';
  const screenBottomPaddingClass = showTimerPanel ? 'pb-[34rem]' : 'pb-40';
  const selectedExerciseBodyClass = showTimerPanel
    ? 'max-h-[320px]'
    : 'max-h-[calc(100vh-14rem)]';
  const timerPanelClass = showTimerPanel
    ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
    : 'pointer-events-none translate-y-8 scale-95 opacity-0';
  const showFinishWorkoutButton = allCompleted && !selectedExercise && !isWorkoutFinishing;

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
    }
  };

  return (
    <div
      {...swipeBackHandlers}
      className={`screen-fade-in min-h-screen flex flex-col transition-all duration-500 ${screenBottomPaddingClass}`}
      style={{ ...swipeBackStyle, touchAction: 'pan-y' }}
    >
      <div className="p-4 flex-1">
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

          {allCompleted && (
            <div className="content-rise-in bg-green-500/20 border border-green-500/30 text-green-300 px-4 py-3 rounded-xl mb-4" style={{ animationDelay: '90ms' }}>
              🎉 Отличная тренировка! Все упражнения выполнены!
            </div>
          )}

          <div className="space-y-4">
            {exercises.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <p className="text-lg">Нет упражнений</p>
                <p className="text-sm">Добавьте их в настройках тренировки</p>
              </div>
            ) : (
              exercises.map((exercise, exerciseIndex) => {
                const isSelected = selectedExercise?.id === exercise.id;
                const allSetsCompleted = exercise.sets.every(s => s.completed);
                const showExercise = !selectedExercise || isSelected;

                if (!showExercise) return null;

                return (
                  <div
                    key={exercise.id}
                    className={`content-rise-in bg-slate-900/60 backdrop-blur-md border rounded-2xl overflow-hidden transition-all shadow-lg shadow-black/20 ${
                      allSetsCompleted
                        ? 'border-green-500/50 shadow-[0_0_24px_rgba(34,197,94,0.12)]'
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
                          onClick={() => onSelectExercise(isSelected ? null : exercise)}
                          className="text-left"
                        >
                          <h2 className="text-xl font-semibold text-white">{exercise.name}</h2>
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

      <div className={`fixed bottom-[calc(6.9rem+env(safe-area-inset-bottom))] left-0 right-0 z-10 px-4 transition-all duration-500 ease-out ${timerPanelClass}`}>
          <div className="max-w-md mx-auto flex justify-center">
            <div className={`relative flex h-72 w-72 items-center justify-center rounded-full overflow-hidden ${timerGlow}`}>
              <svg
                className={`absolute inset-0 h-full w-full -rotate-90 rounded-full ${isSetActive ? 'animate-pulse' : ''}`}
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
                {isRestActive && (
                  <circle
                    cx="110"
                    cy="110"
                    r="96"
                    fill="none"
                    stroke="rgba(96, 165, 250, 0.16)"
                    strokeWidth="24"
                  />
                )}
                <circle
                  cx="110"
                  cy="110"
                  r="96"
                  fill="none"
                  stroke={timerStroke}
                  strokeWidth={isRestActive ? '16' : '14'}
                  strokeLinecap="round"
                  strokeDasharray={timerCircumference}
                  strokeDashoffset={timerOffset}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <div className="flex h-44 w-44 flex-col items-center justify-center rounded-full border border-white/10 bg-[#071121]/95 shadow-inner shadow-black/50">
                <span className={`text-base font-semibold tracking-[0.2em] ${isRestActive ? 'text-blue-300' : 'text-orange-300'}`}>
                  {timerLabel}
                </span>
                <span className="mt-2 text-6xl font-bold text-white tabular-nums">
                  {formatTimer(timerValue)}
                </span>
              </div>
            </div>
          </div>
        </div>

      {(currentAction || showFinishWorkoutButton) && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-gradient-to-t from-[#0B1528] via-[#0B1528] to-transparent">
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
                {currentAction.label}
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
  onAddExercise,
  onEditExercise,
  onDeleteExercise,
}) {
  const { handlers: swipeBackHandlers, style: swipeBackStyle } = useSwipeBack(true, onBack);

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

          <button
            onClick={() => {
              if (name.trim()) {
                onSave(name.trim());
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
