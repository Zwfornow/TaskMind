import { useEffect, useState, type CSSProperties } from 'react'
import { AiWorkspace } from './components/AiWorkspace'
import { FlipDigit } from './components/FlipDigit'
import './App.css'

type RepeatRule = 'none' | 'daily' | 'monthly'

type Todo = {
  id: string
  title: string
  time: string
  repeat: RepeatRule
  createdDate: string
  skippedDates?: string[]
  stopDate?: string
}

type StoredState = {
  todos: Todo[]
  completionMap: Record<string, string[]>
  selectedDateKey: string
}

type DraftTodo = {
  title: string
  time: string
  repeat: RepeatRule
  date: string
}

type DeleteScope = 'single' | 'future'

type DeleteDialogState = {
  todoId: string
  title: string
  repeat: RepeatRule
  selectedDateKey: string
} | null

type ComposerState = {
  mode: 'create' | 'edit'
  todoId: string | null
}

type Quote = {
  text: string
  author: string
}

const STORAGE_KEY = 'todolist-dashboard-state-v1'
const ROTATING_QUOTES: Quote[] = [
  {
    text: '不要等待时机，去创造时机。',
    author: '本杰明·迪斯雷利',
  },
  {
    text: '未来取决于你今天做什么，而不是明天。',
    author: '圣雄甘地',
  },
  {
    text: '伟大的事业都始于把今天过好。',
    author: '威廉·奥斯勒',
  },
  {
    text: '成功是日复一日重复那些简单却正确的事。',
    author: '罗伯特·科利尔',
  },
  {
    text: '你不必很厉害才能开始，但你必须开始，才会很厉害。',
    author: '齐格·金克拉',
  },
]
function createDefaultDraft(dateKey: string): DraftTodo {
  return {
    title: '',
    time: '09:00',
    repeat: 'none',
    date: dateKey,
  }
}

const repeatLabelMap: Record<RepeatRule, string> = {
  none: '单次',
  daily: '每天',
  monthly: '每月',
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function getMonthDays(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate()
}

function isBeforeDateKey(left: string, right: string) {
  return parseDateKey(left).getTime() < parseDateKey(right).getTime()
}

function isTodoVisibleOnDate(todo: Todo, dateKey: string) {
  if (todo.repeat === 'none') {
    return todo.createdDate === dateKey
  }

  if (isBeforeDateKey(dateKey, todo.createdDate)) {
    return false
  }

  if (todo.stopDate && !isBeforeDateKey(dateKey, todo.stopDate)) {
    return false
  }

  if (todo.skippedDates?.includes(dateKey)) {
    return false
  }

  if (todo.repeat === 'daily') {
    return true
  }

  const createdDate = parseDateKey(todo.createdDate)
  const currentDate = parseDateKey(dateKey)
  const targetDay = createdDate.getDate()
  const lastDayOfMonth = getMonthDays(
    currentDate.getFullYear(),
    currentDate.getMonth(),
  )
  const effectiveDay = Math.min(targetDay, lastDayOfMonth)

  return currentDate.getDate() === effectiveDay
}

function getProgressForDate(
  todos: Todo[],
  completionMap: Record<string, string[]>,
  dateKey: string,
) {
  const activeTodos = todos.filter((todo) => isTodoVisibleOnDate(todo, dateKey))
  const completedIds = new Set(completionMap[dateKey] ?? [])
  const completedCount = activeTodos.filter((todo) => completedIds.has(todo.id)).length

  return {
    activeTodos,
    total: activeTodos.length,
    completed: completedCount,
  }
}

function getCalendarDays(viewDate: Date) {
  const monthStart = getMonthStart(viewDate)
  const startOffset = (monthStart.getDay() + 6) % 7
  const firstCellDate = addDays(monthStart, -startOffset)

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(firstCellDate, index)
    return {
      date,
      dateKey: formatDateKey(date),
      isCurrentMonth: date.getMonth() === viewDate.getMonth(),
    }
  })
}

function formatFullDate(dateKey: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(parseDateKey(dateKey))
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
  }).format(date)
}

function formatDateTimeLabel(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

function formatClockValue(value: number) {
  return `${value}`.padStart(2, '0')
}

function formatClockHeader(date: Date) {
  return {
    year: `${date.getFullYear()}`,
    dateLabel: new Intl.DateTimeFormat('zh-CN', {
      month: 'long',
      day: 'numeric',
    }).format(date),
    weekdayLabel: new Intl.DateTimeFormat('zh-CN', {
      weekday: 'long',
    }).format(date),
  }
}

function getClockGroups(date: Date) {
  return [
    {
      label: '时',
      value: formatClockValue(date.getHours()),
    },
    {
      label: '分',
      value: formatClockValue(date.getMinutes()),
    },
    {
      label: '秒',
      value: formatClockValue(date.getSeconds()),
    },
  ]
}

function getEncouragementPhrases(completed: number, total: number): string[] {
  if (total === 0) {
    return [
      '先加一件今天最想完成的小事，节奏会马上建立起来。',
      '清单空着，是最好的开始时机。',
      '哪怕写下一件事，今天就已经不一样了。',
      '从你现在最想做的一件事开始。',
    ]
  }

  const ratio = completed / total

  if (ratio >= 1) {
    return [
      '今天的计划已经全部达成，干得漂亮！',
      '清单清零，今天圆满。',
      '所有任务完成，你今天赢了！',
      '完美收官，好好休息吧。',
    ]
  }

  if (ratio >= 0.75) {
    return [
      '已经进入收官阶段，再推进一点就能清空清单。',
      '最后几项，你已经看到终点了。',
      '快了，剩下的都是胜利前的最后一步。',
      '75% 以上，今天已经很成功了，把剩余的一起收尾吧。',
    ]
  }

  if (ratio >= 0.5) {
    return [
      '进度已经过半，继续按当前节奏推进就好。',
      '超过一半了，下半场属于你。',
      '节奏很好，不要停下来。',
      '半数已完成，保持专注，终点就在前方。',
    ]
  }

  if (ratio > 0) {
    return [
      '已经有完成记录了，接下来优先拿下最容易的一项。',
      '开了个好头，继续推进！',
      '第一步已迈出，后面会越来越顺。',
      '每完成一项都是进步，继续加油。',
    ]
  }

  return [
    '开始第一项就会打破停滞，先做最小的一步。',
    '不管从哪里开始，开始就是胜利。',
    '选一件最简单的先完成，动起来最重要。',
    '今天的第一步，就在等你迈出。',
  ]
}

function loadStoredState(): StoredState {
  const todayKey = formatDateKey(new Date())

  if (typeof window === 'undefined') {
    return {
      todos: [],
      completionMap: {},
      selectedDateKey: todayKey,
    }
  }

  try {
    const rawState = window.localStorage.getItem(STORAGE_KEY)

    if (!rawState) {
      return {
        todos: [],
        completionMap: {},
        selectedDateKey: todayKey,
      }
    }

    const parsedState = JSON.parse(rawState) as Partial<StoredState>
    return {
      todos: Array.isArray(parsedState.todos) ? parsedState.todos : [],
      completionMap:
        parsedState.completionMap && typeof parsedState.completionMap === 'object'
          ? parsedState.completionMap
          : {},
      selectedDateKey:
        typeof parsedState.selectedDateKey === 'string'
          ? parsedState.selectedDateKey
          : todayKey,
    }
  } catch {
    return {
      todos: [],
      completionMap: {},
      selectedDateKey: todayKey,
    }
  }
}

function createTodoId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function App() {
  const [initialState] = useState(loadStoredState)
  const [todos, setTodos] = useState<Todo[]>(initialState.todos)
  const [completionMap, setCompletionMap] = useState<Record<string, string[]>>(
    initialState.completionMap,
  )
  const [selectedDateKey, setSelectedDateKey] = useState(initialState.selectedDateKey)
  const [calendarMonth, setCalendarMonth] = useState(
    getMonthStart(parseDateKey(initialState.selectedDateKey)),
  )
  const [draftTodo, setDraftTodo] = useState<DraftTodo>(() =>
    createDefaultDraft(initialState.selectedDateKey),
  )
  const [isComposerOpen, setIsComposerOpen] = useState(false)
  const [composerState, setComposerState] = useState<ComposerState>({
    mode: 'create',
    todoId: null,
  })
  const [deleteDialogState, setDeleteDialogState] = useState<DeleteDialogState>(null)
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date())
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [encouragementIndex, setEncouragementIndex] = useState(0)

  const todayKey = formatDateKey(new Date())
  const selectedProgress = getProgressForDate(todos, completionMap, selectedDateKey)
  const selectedCompletedIds = new Set(completionMap[selectedDateKey] ?? [])
  const visibleTodos = [...selectedProgress.activeTodos].sort((left, right) =>
    left.time.localeCompare(right.time),
  )
  const calendarDays = getCalendarDays(calendarMonth)
  const selectedDayLabel = selectedDateKey === todayKey ? '今天' : '当前选中日期'
  const currentQuote = ROTATING_QUOTES[quoteIndex % ROTATING_QUOTES.length]
  const clockHeader = formatClockHeader(currentDateTime)
  const clockGroups = getClockGroups(currentDateTime)
  const todayProgress = getProgressForDate(todos, completionMap, todayKey)
  const todayCompletionPercent = todayProgress.total
    ? Math.round((todayProgress.completed / todayProgress.total) * 100)
    : 0
  const todayRemainingCount = todayProgress.total - todayProgress.completed
  const todayRemainingPercent = todayProgress.total
    ? Math.max(0, 100 - todayCompletionPercent)
    : 0
  const encouragementPhrases = getEncouragementPhrases(
    todayProgress.completed,
    todayProgress.total,
  )
  const encouragementCopy = encouragementPhrases[encouragementIndex % encouragementPhrases.length]

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        todos,
        completionMap,
        selectedDateKey,
      }),
    )
  }, [completionMap, selectedDateKey, todos])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentDateTime(new Date())
    }, 1000)

    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const quoteTimer = window.setInterval(() => {
      setQuoteIndex((currentIndex) => (currentIndex + 1) % ROTATING_QUOTES.length)
    }, 10000)

    return () => window.clearInterval(quoteTimer)
  }, [])

  useEffect(() => {
    setEncouragementIndex(0)
  }, [todayProgress.completed, todayProgress.total])

  useEffect(() => {
    const encouragementTimer = window.setInterval(() => {
      setEncouragementIndex((i) => i + 1)
    }, 20000)
    return () => window.clearInterval(encouragementTimer)
  }, [])

  function handleSelectDate(dateKey: string) {
    setSelectedDateKey(dateKey)
    setCalendarMonth(getMonthStart(parseDateKey(dateKey)))
  }

  function removeTodoFromCompletionMap(
    todoId: string,
    shouldRemove: (dateKey: string) => boolean,
  ) {
    setCompletionMap((currentMap) => {
      const nextEntries = Object.entries(currentMap).flatMap(([dateKey, ids]) => {
        if (!shouldRemove(dateKey)) {
          return [[dateKey, ids] as const]
        }

        const filteredIds = ids.filter((id) => id !== todoId)
        return filteredIds.length > 0 ? [[dateKey, filteredIds] as const] : []
      })

      return Object.fromEntries(nextEntries)
    })
  }

  function removeMultipleTodos(todoIds: string[]) {
    const todoIdSet = new Set(todoIds)

    setTodos((currentTodos) => currentTodos.filter((todo) => !todoIdSet.has(todo.id)))
    setCompletionMap((currentMap) => {
      const nextEntries = Object.entries(currentMap).flatMap(([dateKey, ids]) => {
        const filteredIds = ids.filter((id) => !todoIdSet.has(id))
        return filteredIds.length > 0 ? [[dateKey, filteredIds] as const] : []
      })

      return Object.fromEntries(nextEntries)
    })
  }

  function handleToggleComplete(todoId: string) {
    setCompletionMap((currentMap) => {
      const updatedIds = new Set(currentMap[selectedDateKey] ?? [])

      if (updatedIds.has(todoId)) {
        updatedIds.delete(todoId)
      } else {
        updatedIds.add(todoId)
      }

      const nextMap = { ...currentMap }

      if (updatedIds.size === 0) {
        delete nextMap[selectedDateKey]
      } else {
        nextMap[selectedDateKey] = Array.from(updatedIds)
      }

      return nextMap
    })
  }

  function handleDeleteTodo(todoId: string) {
    const targetTodo = todos.find((todo) => todo.id === todoId)

    if (!targetTodo) {
      return
    }

    setDeleteDialogState({
      todoId,
      title: targetTodo.title,
      repeat: targetTodo.repeat,
      selectedDateKey,
    })
  }

  function handleConfirmDeleteTodo() {
    if (!deleteDialogState) {
      return
    }

    setTodos((currentTodos) =>
      currentTodos.filter((todo) => todo.id !== deleteDialogState.todoId),
    )
    removeTodoFromCompletionMap(deleteDialogState.todoId, () => true)
    setDeleteDialogState(null)
  }

  function handleDeleteRecurringTodo(scope: DeleteScope) {
    if (!deleteDialogState) {
      return
    }

    const { todoId, selectedDateKey: deleteDateKey } = deleteDialogState

    if (scope === 'single') {
      setTodos((currentTodos) =>
        currentTodos.map((todo) => {
          if (todo.id !== todoId) {
            return todo
          }

          const skippedDates = new Set(todo.skippedDates ?? [])
          skippedDates.add(deleteDateKey)

          return {
            ...todo,
            skippedDates: Array.from(skippedDates).sort(),
          }
        }),
      )
      removeTodoFromCompletionMap(todoId, (dateKey) => dateKey === deleteDateKey)
      setDeleteDialogState(null)
      return
    }

    setTodos((currentTodos) =>
      currentTodos.flatMap((todo) => {
        if (todo.id !== todoId) {
          return [todo]
        }

        if (!isBeforeDateKey(todo.createdDate, deleteDateKey)) {
          return []
        }

        return [
          {
            ...todo,
            stopDate: deleteDateKey,
          },
        ]
      }),
    )
    removeTodoFromCompletionMap(todoId, (dateKey) => !isBeforeDateKey(dateKey, deleteDateKey))
    setDeleteDialogState(null)
  }

  function handleDraftChange<Key extends keyof DraftTodo>(key: Key, value: DraftTodo[Key]) {
    setDraftTodo((currentDraft) => ({
      ...currentDraft,
      [key]: value,
    }))
  }

  function handleCreateTodo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const title = draftTodo.title.trim()

    if (!title) {
      return
    }

    if (composerState.mode === 'edit' && composerState.todoId) {
      setTodos((currentTodos) =>
        currentTodos.map((todo) => {
          if (todo.id !== composerState.todoId) {
            return todo
          }

          return {
            ...todo,
            title,
            time: draftTodo.time,
            repeat: draftTodo.repeat,
            createdDate: draftTodo.date,
          }
        }),
      )
      handleCloseComposer()
      return
    }

    const newTodo: Todo = {
      id: createTodoId(),
      title,
      time: draftTodo.time,
      repeat: draftTodo.repeat,
      createdDate: draftTodo.date,
    }

    setTodos((currentTodos) => [...currentTodos, newTodo])
    handleCloseComposer()
  }

  function handleOpenComposer() {
    setComposerState({
      mode: 'create',
      todoId: null,
    })
    setDraftTodo(createDefaultDraft(selectedDateKey))
    setIsComposerOpen(true)
  }

  function handleOpenEditor(todoId: string) {
    const targetTodo = todos.find((todo) => todo.id === todoId)

    if (!targetTodo) {
      return
    }

    setComposerState({
      mode: 'edit',
      todoId,
    })
    setDraftTodo({
      title: targetTodo.title,
      time: targetTodo.time,
      repeat: targetTodo.repeat,
      date: targetTodo.createdDate,
    })
    setIsComposerOpen(true)
  }

  function handleCloseComposer() {
    setIsComposerOpen(false)
    setComposerState({
      mode: 'create',
      todoId: null,
    })
    setDraftTodo(createDefaultDraft(selectedDateKey))
  }

  function handleAddAiTodos(aiTodos: Array<Pick<Todo, 'id' | 'title' | 'time' | 'repeat' | 'createdDate'>>) {
    setTodos((currentTodos) => [...currentTodos, ...aiTodos])
  }

  function handleUpdateAiTodos(
    updates: Array<Pick<Todo, 'id' | 'title' | 'time' | 'repeat' | 'createdDate'>>,
  ) {
    const updateMap = new Map(updates.map((update) => [update.id, update]))

    setTodos((currentTodos) =>
      currentTodos.map((todo) => {
        const update = updateMap.get(todo.id)

        if (!update) {
          return todo
        }

        return {
          ...todo,
          title: update.title,
          createdDate: update.createdDate,
          time: update.time,
          repeat: update.repeat,
        }
      }),
    )
  }

  return (
    <div className="app-shell">
      <div className="page-backdrop" aria-hidden="true" />

      <header className="hero-panel">
        <aside className="mind-column" aria-label="TaskMind 顶部信息区">
          <section className="mind-card mind-title-card" aria-labelledby="taskmind-title">
            <p className="section-label">TaskMind</p>
            <h1 id="taskmind-title">TaskMind</h1>
            <blockquote className="quote-content">
              <p>“{currentQuote.text}”</p>
              <footer>---{currentQuote.author}</footer>
            </blockquote>
          </section>

          <section className="mind-card clock-card" aria-labelledby="clock-title">
            <div className="mind-card-header">
              <div>
                <p className="section-label">翻页时钟</p>
              </div>
            </div>

            <div className="clock-header-panel">
              <span className="clock-year">{clockHeader.year}</span>
              <div className="clock-date-copy">
                <strong>{clockHeader.dateLabel}</strong>
                <span>{clockHeader.weekdayLabel}</span>
              </div>
            </div>

            <div className="flip-clock" aria-label={formatDateTimeLabel(currentDateTime)}>
              {clockGroups.map((group) => (
                <div key={group.label} className="flip-clock-group">
                  <FlipDigit value={group.value} />
                  <span className="flip-label">{group.label}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="mind-card completion-card" aria-labelledby="completion-title">
            <div className="mind-card-header">
              <div>
                <p className="section-label">任务完成度</p>
              </div>
              <span className="card-meta">共 {todayProgress.total} 项</span>
            </div>

            <div className="completion-single">
              <div className="completion-track-wrap">
                <div className="completion-track" aria-hidden="true">
                  <div
                    className="completion-fill-complete"
                    style={{ width: `${todayCompletionPercent}%` }}
                  />
                </div>
              </div>
              <div className="completion-stats">
                <div className="completion-stat-item">
                  <strong>{todayProgress.completed}</strong>
                  <span>已完成 {todayCompletionPercent}%</span>
                </div>
                <div className="completion-stat-item is-right">
                  <strong>{todayRemainingCount}</strong>
                  <span>未完成 {todayRemainingPercent}%</span>
                </div>
              </div>
            </div>

            <p className="encouragement-copy">{encouragementCopy}</p>
          </section>
        </aside>
      </header>

      <main className="content-grid">
        <section className="panel calendar-panel">
          <div className="panel-heading calendar-heading">
            <div>
              <h2>{formatMonthLabel(calendarMonth)}</h2>
            </div>
            <div className="calendar-controls">
              <button
                type="button"
                className="calendar-nav"
                aria-label="上一年"
                title="上一年"
                onClick={() =>
                  setCalendarMonth(
                    (current) => new Date(current.getFullYear() - 1, current.getMonth(), 1),
                  )
                }
              >
                &laquo;
              </button>
              <button
                type="button"
                className="calendar-nav"
                aria-label="上个月"
                title="上个月"
                onClick={() =>
                  setCalendarMonth(
                    (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                  )
                }
              >
                &lsaquo;
              </button>
              <button
                type="button"
                className="calendar-nav"
                aria-label="下个月"
                title="下个月"
                onClick={() =>
                  setCalendarMonth(
                    (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                  )
                }
              >
                &rsaquo;
              </button>
              <button
                type="button"
                className="calendar-nav"
                aria-label="下一年"
                title="下一年"
                onClick={() =>
                  setCalendarMonth(
                    (current) => new Date(current.getFullYear() + 1, current.getMonth(), 1),
                  )
                }
              >
                &raquo;
              </button>
            </div>
          </div>

          <div className="weekday-row" aria-hidden="true">
            {['一', '二', '三', '四', '五', '六', '日'].map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>

          <div className="calendar-grid">
            {calendarDays.map(({ date, dateKey, isCurrentMonth }) => {
              const progress = getProgressForDate(todos, completionMap, dateKey)
              const completionPercent = progress.total
                ? Math.round((progress.completed / progress.total) * 100)
                : 0
              const isToday = dateKey === todayKey
              const isSelected = dateKey === selectedDateKey

              return (
                <button
                  key={dateKey}
                  type="button"
                  style={{ '--calendar-progress': `${completionPercent}%` } as CSSProperties}
                  className={[
                    'calendar-day',
                    isCurrentMonth ? '' : 'is-muted',
                    isToday ? 'is-today' : '',
                    isSelected ? 'is-selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleSelectDate(dateKey)}
                >
                  <span className="calendar-day-top">
                    <strong>{date.getDate()}</strong>
                    {isToday ? <em>今天</em> : null}
                  </span>
                  <span className="calendar-progress">
                    {progress.completed}/{progress.total}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="panel list-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">{selectedDayLabel}</p>
              <h2>{formatFullDate(selectedDateKey)}</h2>
            </div>
            <div className="progress-pill">进度 {selectedProgress.completed}/{selectedProgress.total}</div>
          </div>

          <div className="list-scroll-area">
            {visibleTodos.length > 0 ? (
              <ul className="todo-list">
                {visibleTodos.map((todo) => {
                  const isCompleted = selectedCompletedIds.has(todo.id)

                  return (
                    <li
                      key={todo.id}
                      className={`todo-item${isCompleted ? ' is-completed' : ''}`}
                    >
                      <label className="todo-main">
                        <input
                          type="checkbox"
                          checked={isCompleted}
                          onChange={() => handleToggleComplete(todo.id)}
                        />
                        <span className="todo-copy">
                          <strong>{todo.title}</strong>
                          <span>
                            {todo.time} · {repeatLabelMap[todo.repeat]}
                          </span>
                        </span>
                      </label>

                      <div className="todo-actions">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`编辑 ${todo.title}`}
                          title="编辑 Todo"
                          onClick={() => handleOpenEditor(todo.id)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M4 17.25V20h2.75L17.81 8.94l-2.75-2.75L4 17.25Zm15.71-9.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.96 1.96 3.92 3.92 1.96-1.96Z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="icon-button delete-button"
                          aria-label={`删除 ${todo.title}`}
                          title="删除 Todo"
                          onClick={() => handleDeleteTodo(todo.id)}
                        >
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 7h2v8h-2v-8Zm4 0h2v8h-2v-8ZM7 10h2v8H7v-8Zm-1 10h12a2 2 0 0 0 2-2V8H4v10a2 2 0 0 0 2 2Z" />
                          </svg>
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="empty-state">
                <p>今天还没有待办事项</p>
                <span>点击下方按钮新增任务，或切换日历查看其他日期的完成情况吧</span>
              </div>
            )}
          </div>

          <div className="list-footer">
            <button
              type="button"
              className="add-button"
              onClick={handleOpenComposer}
            >
              + 新增 Todo
            </button>
          </div>
        </section>

        <AiWorkspace
          todos={todos}
          selectedDateKey={selectedDateKey}
          onAddTodos={handleAddAiTodos}
          onDeleteTodos={removeMultipleTodos}
          onUpdateTodos={handleUpdateAiTodos}
        />
      </main>

      {isComposerOpen ? (
        <div className="composer-overlay" role="presentation" onClick={handleCloseComposer}>
          <div
            className="composer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="composer-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="composer-header">
              <div>
                <p className="section-label">
                  {composerState.mode === 'edit' ? '编辑事项' : '新增事项'}
                </p>
                <strong id="composer-title">
                  {composerState.mode === 'edit'
                    ? '修改 Todo 详情'
                    : `为 ${formatFullDate(selectedDateKey)} 添加 Todo`}
                </strong>
              </div>
            </div>

            <form className="composer-form" onSubmit={handleCreateTodo}>
              <label>
                <span>事项名称</span>
                <input
                  type="text"
                  value={draftTodo.title}
                  onChange={(event) => handleDraftChange('title', event.target.value)}
                  placeholder="例如：晨会前整理需求清单"
                />
              </label>

              <div className="form-row">
                <label>
                  <span>日期</span>
                  <input
                    type="date"
                    value={draftTodo.date}
                    onChange={(event) => handleDraftChange('date', event.target.value)}
                  />
                </label>

                <label>
                  <span>时间</span>
                  <input
                    type="time"
                    value={draftTodo.time}
                    onChange={(event) => handleDraftChange('time', event.target.value)}
                  />
                </label>

                <label>
                  <span>重复规则</span>
                  <select
                    value={draftTodo.repeat}
                    onChange={(event) =>
                      handleDraftChange('repeat', event.target.value as RepeatRule)
                    }
                  >
                    <option value="none">不重复</option>
                    <option value="daily">每天</option>
                    <option value="monthly">每月</option>
                  </select>
                </label>
              </div>

              <div className="composer-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleCloseComposer}
                >
                  取消
                </button>
                <button type="submit" className="primary-button">
                  {composerState.mode === 'edit' ? '保存修改' : '保存事项'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteDialogState ? (
        <div
          className="composer-overlay"
          role="presentation"
          onClick={() => setDeleteDialogState(null)}
        >
          <div
            className="composer-panel confirm-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="composer-header">
              <div>
                <p className="section-label">
                  {deleteDialogState.repeat === 'none' ? '删除事项' : '删除重复事项'}
                </p>
                <h3 id="delete-dialog-title">确认要删除下列事项吗？</h3>
              </div>
            </div>

            <div className="confirm-copy">
              <strong>{deleteDialogState.title}</strong>
              {deleteDialogState.repeat === 'none' ? (
                <>
                  <span>删除后，这条单次 Todo 会从列表和完成记录中移除。</span>
                </>
              ) : (
                <>
                  <span>
                    这个事项是重复任务。请选择只删除 {formatFullDate(deleteDialogState.selectedDateKey)} 这一次，还是删除从这一天开始的后续所有重复事项。
                  </span>
                </>
              )}
            </div>

            <div className="confirm-actions">
              {deleteDialogState.repeat === 'none' ? (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setDeleteDialogState(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="primary-button danger-button"
                    onClick={handleConfirmDeleteTodo}
                  >
                    确认删除
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setDeleteDialogState(null)}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => handleDeleteRecurringTodo('single')}
                  >
                    仅删除这一次
                  </button>
                  <button
                    type="button"
                    className="primary-button danger-button"
                    onClick={() => handleDeleteRecurringTodo('future')}
                  >
                    删除后续所有重复事项
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

    </div>
  )
}

export default App
