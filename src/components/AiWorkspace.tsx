import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

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

type DraftTodo = {
  title: string
  time: string
  repeat: RepeatRule
  date: string
}

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
  createdAt: string
}

type Conversation = {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

type AiSuggestion = {
  id: string
  title: string
  time: string
  repeat: RepeatRule
  createdDate: string
  reason: string
}

type AiDeleteCandidate = {
  todoId: string
  title: string
  createdDate: string
  time: string
  repeat: RepeatRule
  reason: string
}

type AiAdjustment = {
  todoId: string
  currentTitle: string
  currentDate: string
  currentTime: string
  currentRepeat: RepeatRule
  newTitle: string
  newDate: string
  newTime: string
  newRepeat: RepeatRule
  reason: string
}

type SuggestionDialogState = {
  summary: string
  suggestions: AiSuggestion[]
  selectedIds: string[]
} | null

type DeleteSuggestionDialogState = {
  summary: string
  candidates: AiDeleteCandidate[]
  selectedIds: string[]
} | null

type AdjustmentDialogState = {
  summary: string
  suggestions: AiAdjustment[]
  selectedIds: string[]
} | null

type SuggestionEditorState = {
  suggestionId: string
  draft: DraftTodo
} | null

type TodoUpdate = Pick<Todo, 'id' | 'title' | 'time' | 'repeat' | 'createdDate'>

type AiWorkspaceProps = {
  todos: Todo[]
  selectedDateKey: string
  onAddTodos: (todos: Todo[]) => void
  onDeleteTodos: (todoIds: string[]) => void
  onUpdateTodos: (updates: TodoUpdate[]) => void
}

type DeepSeekResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

type ParsedAiResponse = {
  action?: string
  summary?: string
  items?: unknown
  reply?: string
}

type ParsedAiResponseResult = {
  parsed: ParsedAiResponse
  usedFallback: boolean
}

const DEEPSEEK_PROXY_API_URL = '/api/deepseek'
const CONVERSATION_STORAGE_KEY = 'todolist-xiaozhi-conversations-v1'
const MAX_PERSISTED_CONVERSATIONS = 20
const MAX_PERSISTED_MESSAGES = 100
const repeatLabelMap: Record<RepeatRule, string> = {
  none: '单次',
  daily: '每天',
  monthly: '每月',
}
const DEEPSEEK_SYSTEM_PROMPT = `你叫小知，是一个可靠、直接、懂任务规划也懂通用知识问答的中文 AI 助手。你接入在 Todo 页面中，因此你既能正常回答知识问题，也拥有对当前 Todo 列表进行新增、删除、编辑、分析并给出建议的能力。

你必须遵守以下身份和行为规则：
1. 当用户的问题不涉及 Todo 操作、任务规划、日程拆解时，请优先基于你自身知识直接回答，action 必须返回 reply。
2. 当用户涉及学习某个主题、源码、技术栈、课程、知识体系时，如果用户没有明确要求“制定 Todo / 生成计划 / 拆成待办 / 安排到今天和未来几天”，你应先用 reply 进行简短回应，并追问用户是否需要你继续制定 Todo 计划。
3. 当用户已经明确要求你制定计划、拆成 Todo、加入待办、安排时间，或者上下文已经确认要生成待办时，你应返回 add。
4. 你可以根据用户要求对现有 Todo 进行 delete、adjust，或对 Todo 安排做分析后给出建议。
5. 你不需要为了迎合格式而把普通知识问答伪装成 Todo 建议。

动作规则：
1. action 只能是 add、delete、adjust、reply 四种之一。
2. add 模式下，事项必须具体、可执行、可安排进日程，不要泛泛而谈。
3. add 模式优先拆解成 3 到 8 条任务；如果信息不足，可以输出 1 到 3 条起步任务。
4. delete 模式必须基于当前 Todo 列表返回真实存在的 todoId 和原因，不得杜撰。
5. adjust 模式必须基于当前 Todo 列表返回真实存在的 todoId 以及修改后的字段，不得杜撰。
6. date 必须使用 YYYY-MM-DD，且不能早于今天。
7. time 必须使用 24 小时制 HH:mm。
8. repeat 只能是 none、daily、monthly。
9. 当你生成 add 或 adjust 结果时，必须参考当前 Todo 列表，尽量避免同一天出现相同 time 的事项；如果需要连续安排，请主动错开时间。
10. reason 用一句话说明新增、删除或调整的原因。
11. reply 模式请给出自然、直接、对用户有帮助的中文回复；如果是学习类追问，请明确问用户是否需要你继续制定 Todo 计划。
12. 只输出 JSON，不要输出 Markdown，不要输出额外解释。

JSON 格式必须严格如下：
{
  "action": "reply",
  "summary": "对本次动作的简短总结",
  "items": [
    {
      "todoId": "仅 delete 和 adjust 模式需要",
      "title": "事项标题，仅 add 和 adjust 模式需要",
      "date": "2026-05-09，仅 add 和 adjust 模式需要",
      "time": "09:00，仅 add 和 adjust 模式需要",
      "repeat": "none，仅 add 和 adjust 模式需要",
      "reason": "原因说明"
    }
  ],
  "reply": "当 action=reply 时，这里返回自然语言回复"
}`

function createUiId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createTimestamp() {
  return new Date().toISOString()
}

function createWelcomeMessage(): ChatMessage {
  return {
    id: createUiId(),
    role: 'assistant',
    createdAt: createTimestamp(),
    content:
      '我是小知。你今天打算先完成什么？如果你暂时没想好，也可以直接问我问题，我会尽量有问必应。比如：最近要学习 Claude Code 知识，帮我制定计划。',
  }
}

function createConversation(): Conversation {
  const timestamp = createTimestamp()

  return {
    id: createUiId(),
    title: '新对话',
    createdAt: timestamp,
    updatedAt: timestamp,
    messages: [createWelcomeMessage()],
  }
}

function truncateText(text: string, length: number) {
  if (text.length <= length) {
    return text
  }

  return `${text.slice(0, length).trim()}...`
}

function getConversationTitle(messages: ChatMessage[]) {
  const firstUserMessage = messages.find((message) => message.role === 'user')

  if (!firstUserMessage) {
    return '新对话'
  }

  return truncateText(firstUserMessage.content.replace(/\s+/g, ' ').trim(), 18) || '新对话'
}

function hasUserMessages(conversation: Conversation) {
  return conversation.messages.some((message) => message.role === 'user')
}

function normalizeConversation(conversation: Conversation): Conversation {
  const messages = conversation.messages.length > 0 ? conversation.messages : [createWelcomeMessage()]
  const updatedAt = conversation.updatedAt || conversation.createdAt || createTimestamp()

  return {
    ...conversation,
    title: getConversationTitle(messages),
    createdAt: conversation.createdAt || updatedAt,
    updatedAt,
    messages,
  }
}

function loadPersistedConversations() {
  if (typeof window === 'undefined') {
    return [] as Conversation[]
  }

  try {
    const raw = window.localStorage.getItem(CONVERSATION_STORAGE_KEY)

    if (!raw) {
      return [] as Conversation[]
    }

    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) {
      return [] as Conversation[]
    }

    return parsed
      .flatMap((item) => {
        if (!item || typeof item !== 'object') {
          return []
        }

        const candidate = item as Conversation
        if (!Array.isArray(candidate.messages)) {
          return []
        }

        return [normalizeConversation(candidate)]
      })
      .filter(hasUserMessages)
      .slice(0, MAX_PERSISTED_CONVERSATIONS)
  } catch {
    return [] as Conversation[]
  }
}

function createInitialConversationState() {
  const persisted = loadPersistedConversations()
  const freshConversation = createConversation()

  return {
    conversations: [freshConversation, ...persisted],
    activeConversationId: freshConversation.id,
  }
}

function formatDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year, month - 1, day)
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
  const lastDayOfMonth = getMonthDays(currentDate.getFullYear(), currentDate.getMonth())
  const effectiveDay = Math.min(targetDay, lastDayOfMonth)

  return currentDate.getDate() === effectiveDay
}

function normalizeTimeValue(timeText?: string) {
  if (!timeText) {
    return '09:00'
  }

  const normalized = timeText.replace('：', ':')
  const parts = normalized.split(':')
  const hour = Number(parts[0])
  const minute = Number(parts[1] ?? '0')

  if (Number.isNaN(hour) || hour < 0 || hour > 23) {
    return '09:00'
  }

  if (Number.isNaN(minute) || minute < 0 || minute > 59) {
    return `${`${hour}`.padStart(2, '0')}:00`
  }

  return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`
}

function normalizeRepeatRule(value?: string) {
  if (!value) {
    return 'none' as const
  }

  if (value === 'daily' || value.includes('每天')) {
    return 'daily' as const
  }

  if (value === 'monthly' || value.includes('每月')) {
    return 'monthly' as const
  }

  return 'none' as const
}

function normalizeDateValue(dateText: string | undefined, fallbackDateKey: string, baseDate: Date) {
  if (!dateText) {
    return fallbackDateKey
  }

  if (dateText.includes('今天')) {
    return formatDateKey(baseDate)
  }

  if (dateText.includes('明天')) {
    return formatDateKey(addDays(baseDate, 1))
  }

  if (dateText.includes('后天')) {
    return formatDateKey(addDays(baseDate, 2))
  }

  const slashMatch = dateText.match(/(\d{1,2})\/(\d{1,2})/)
  if (slashMatch) {
    const parsed = new Date(
      baseDate.getFullYear(),
      Number(slashMatch[1]) - 1,
      Number(slashMatch[2]),
    )
    return formatDateKey(parsed)
  }

  const chineseMatch = dateText.match(/(\d{1,2})月(\d{1,2})日/)
  if (chineseMatch) {
    const parsed = new Date(
      baseDate.getFullYear(),
      Number(chineseMatch[1]) - 1,
      Number(chineseMatch[2]),
    )
    return formatDateKey(parsed)
  }

  const isoMatch = dateText.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/)
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`
  }

  return fallbackDateKey
}

function timeToMinutes(timeText: string) {
  const normalized = normalizeTimeValue(timeText)
  const [hourText, minuteText] = normalized.split(':')
  return Number(hourText) * 60 + Number(minuteText)
}

function minutesToTime(totalMinutes: number) {
  const minutesInDay = 24 * 60
  const normalized = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay
  const hour = Math.floor(normalized / 60)
  const minute = normalized % 60
  return `${`${hour}`.padStart(2, '0')}:${`${minute}`.padStart(2, '0')}`
}

function buildOccupiedTimesForDate(
  todos: Todo[],
  dateKey: string,
  excludedIds = new Set<string>(),
) {
  const occupiedTimes = new Set<string>()

  todos.forEach((todo) => {
    if (excludedIds.has(todo.id) || !isTodoVisibleOnDate(todo, dateKey)) {
      return
    }

    occupiedTimes.add(normalizeTimeValue(todo.time))
  })

  return occupiedTimes
}

function reserveAvailableTime(
  desiredTime: string,
  occupiedTimes: Set<string>,
) {
  const normalizedDesiredTime = normalizeTimeValue(desiredTime)
  const startMinutes = timeToMinutes(normalizedDesiredTime)
  const stepMinutes = 30
  const attempts = (24 * 60) / stepMinutes

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const candidateTime = minutesToTime(startMinutes + attempt * stepMinutes)

    if (!occupiedTimes.has(candidateTime)) {
      occupiedTimes.add(candidateTime)
      return candidateTime
    }
  }

  occupiedTimes.add(normalizedDesiredTime)
  return normalizedDesiredTime
}

function resolveSuggestionTimeConflicts(suggestions: AiSuggestion[], todos: Todo[]) {
  const occupiedTimesByDate = new Map<string, Set<string>>()

  return suggestions.map((suggestion) => {
    const occupiedTimes =
      occupiedTimesByDate.get(suggestion.createdDate) ??
      buildOccupiedTimesForDate(todos, suggestion.createdDate)
    occupiedTimesByDate.set(suggestion.createdDate, occupiedTimes)
    const resolvedTime = reserveAvailableTime(suggestion.time, occupiedTimes)

    if (resolvedTime === suggestion.time) {
      return suggestion
    }

    return {
      ...suggestion,
      time: resolvedTime,
      reason: `${suggestion.reason} 已自动避开同日时间冲突，调整为 ${resolvedTime}。`,
    }
  })
}

function resolveAdjustmentTimeConflicts(suggestions: AiAdjustment[], todos: Todo[]) {
  const excludedIds = new Set(suggestions.map((suggestion) => suggestion.todoId))
  const occupiedTimesByDate = new Map<string, Set<string>>()

  return suggestions.map((suggestion) => {
    const occupiedTimes =
      occupiedTimesByDate.get(suggestion.newDate) ??
      buildOccupiedTimesForDate(todos, suggestion.newDate, excludedIds)
    occupiedTimesByDate.set(suggestion.newDate, occupiedTimes)
    const resolvedTime = reserveAvailableTime(suggestion.newTime, occupiedTimes)

    if (resolvedTime === suggestion.newTime) {
      return suggestion
    }

    return {
      ...suggestion,
      newTime: resolvedTime,
      reason: `${suggestion.reason} 已自动避开同日时间冲突，调整为 ${resolvedTime}。`,
    }
  })
}

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()
}

function extractJsonObject(text: string) {
  const cleaned = stripCodeFence(text)
  const startIndex = cleaned.indexOf('{')

  if (startIndex === -1) {
    throw new Error('AI 返回内容里没有有效的 JSON 结构')
  }

  let depth = 0
  let isInsideString = false
  let isEscaping = false

  for (let index = startIndex; index < cleaned.length; index += 1) {
    const character = cleaned[index]

    if (isEscaping) {
      isEscaping = false
      continue
    }

    if (character === '\\') {
      isEscaping = true
      continue
    }

    if (character === '"') {
      isInsideString = !isInsideString
      continue
    }

    if (isInsideString) {
      continue
    }

    if (character === '{') {
      depth += 1
      continue
    }

    if (character === '}') {
      depth -= 1

      if (depth === 0) {
        return cleaned.slice(startIndex, index + 1)
      }
    }
  }

  throw new Error('AI 返回内容里没有完整的 JSON 结构')
}

function normalizeJsonText(text: string) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
}

function tryParseStructuredAiResponse(text: string) {
  const jsonText = extractJsonObject(text)
  const candidateTexts = [jsonText, normalizeJsonText(jsonText)]

  for (const candidateText of candidateTexts) {
    try {
      return JSON.parse(candidateText) as ParsedAiResponse
    } catch {
      continue
    }
  }

  throw new Error('AI 返回的 JSON 无法解析')
}

function parseAiResponse(text: string): ParsedAiResponseResult {
  try {
    return {
      parsed: tryParseStructuredAiResponse(text),
      usedFallback: false,
    }
  } catch {
    const reply = text.trim()

    return {
      parsed: {
        action: 'reply',
        summary: reply || '小知已完成回复。',
        reply: reply || '小知已完成回复。',
      },
      usedFallback: true,
    }
  }
}

function claimsTodoMutationSucceeded(reply: string) {
  return /(已(经)?(帮你|为你)?(加入|添加|新增|创建|安排|删除|移除|修改|调整)|已经加入todo|已加入待办|已添加到todo|已为你安排)/i.test(
    reply,
  )
}

function sanitizeAiSuggestions(items: unknown, fallbackDateKey: string, baseDate: Date) {
  if (!Array.isArray(items)) {
    return [] as AiSuggestion[]
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const record = item as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title.trim() : ''

    if (!title) {
      return []
    }

    return [
      {
        id: createUiId(),
        title,
        time: normalizeTimeValue(typeof record.time === 'string' ? record.time : undefined),
        repeat: normalizeRepeatRule(typeof record.repeat === 'string' ? record.repeat : undefined),
        createdDate: normalizeDateValue(
          typeof record.date === 'string' ? record.date : undefined,
          fallbackDateKey,
          baseDate,
        ),
        reason:
          typeof record.reason === 'string' && record.reason.trim()
            ? record.reason.trim()
            : '小知根据你的目标拆解出的建议事项。',
      },
    ]
  })
}

function sanitizeAiDeleteCandidates(items: unknown, todos: Todo[]) {
  if (!Array.isArray(items)) {
    return [] as AiDeleteCandidate[]
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const record = item as Record<string, unknown>
    const todoId = typeof record.todoId === 'string' ? record.todoId : ''
    const targetTodo = todos.find((todo) => todo.id === todoId)

    if (!targetTodo) {
      return []
    }

    return [
      {
        todoId,
        title: targetTodo.title,
        createdDate: targetTodo.createdDate,
        time: targetTodo.time,
        repeat: targetTodo.repeat,
        reason:
          typeof record.reason === 'string' && record.reason.trim()
            ? record.reason.trim()
            : '小知识别这是符合条件的待办事项。',
      },
    ]
  })
}

function sanitizeAiAdjustments(
  items: unknown,
  todos: Todo[],
  fallbackDateKey: string,
  baseDate: Date,
) {
  if (!Array.isArray(items)) {
    return [] as AiAdjustment[]
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return []
    }

    const record = item as Record<string, unknown>
    const todoId = typeof record.todoId === 'string' ? record.todoId : ''
    const targetTodo = todos.find((todo) => todo.id === todoId)

    if (!targetTodo) {
      return []
    }

    return [
      {
        todoId,
        currentTitle: targetTodo.title,
        currentDate: targetTodo.createdDate,
        currentTime: targetTodo.time,
        currentRepeat: targetTodo.repeat,
        newTitle:
          typeof record.title === 'string' && record.title.trim()
            ? record.title.trim()
            : targetTodo.title,
        newDate: normalizeDateValue(
          typeof record.date === 'string' ? record.date : undefined,
          fallbackDateKey,
          baseDate,
        ),
        newTime: normalizeTimeValue(typeof record.time === 'string' ? record.time : targetTodo.time),
        newRepeat: normalizeRepeatRule(
          typeof record.repeat === 'string' ? record.repeat : targetTodo.repeat,
        ),
        reason:
          typeof record.reason === 'string' && record.reason.trim()
            ? record.reason.trim()
            : '小知建议调整这个待办以让安排更合理。',
      },
    ]
  })
}

function createChatMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: createUiId(),
    role,
    content,
    createdAt: createTimestamp(),
  }
}

function isLearningRequest(prompt: string) {
  return /(学习|源码|课程|知识|技术栈|教程|读书|研究|掌握|入门|进阶)/i.test(prompt)
}

function isExplicitTodoRequest(prompt: string) {
  return /(todo|待办|计划|拆成|安排|日程|任务清单|制定计划|生成计划|新增任务|加入待办)/i.test(prompt)
}

function formatConversationTime(timestamp: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp))
}

export function AiWorkspace({
  todos,
  selectedDateKey,
  onAddTodos,
  onDeleteTodos,
  onUpdateTodos,
}: AiWorkspaceProps) {
  const [initialConversationState] = useState(createInitialConversationState)
  const [conversations, setConversations] = useState<Conversation[]>(
    initialConversationState.conversations,
  )
  const [activeConversationId, setActiveConversationId] = useState(
    initialConversationState.activeConversationId,
  )
  const [aiPrompt, setAiPrompt] = useState('')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [suggestionDialogState, setSuggestionDialogState] =
    useState<SuggestionDialogState>(null)
  const [deleteSuggestionDialogState, setDeleteSuggestionDialogState] =
    useState<DeleteSuggestionDialogState>(null)
  const [adjustmentDialogState, setAdjustmentDialogState] =
    useState<AdjustmentDialogState>(null)
  const [suggestionEditorState, setSuggestionEditorState] =
    useState<SuggestionEditorState>(null)
  const chatContainerRef = useRef<HTMLDivElement | null>(null)

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0]
  const chatMessages = activeConversation?.messages ?? []
  const isCurrentConversationFresh = activeConversation ? !hasUserMessages(activeConversation) : false

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const persistedConversations = conversations
      .filter(hasUserMessages)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_PERSISTED_CONVERSATIONS)
      .map((conversation) => ({
        ...conversation,
        title: getConversationTitle(conversation.messages),
        messages: conversation.messages.slice(-MAX_PERSISTED_MESSAGES),
      }))

    window.localStorage.setItem(CONVERSATION_STORAGE_KEY, JSON.stringify(persistedConversations))
  }, [conversations])

  useEffect(() => {
    if (!chatContainerRef.current) {
      return
    }

    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
  }, [activeConversationId, chatMessages.length, isAiLoading])

  function patchConversation(
    conversationId: string,
    updater: (conversation: Conversation) => Conversation,
  ) {
    setConversations((currentConversations) =>
      currentConversations.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation
        }

        const nextConversation = updater(conversation)
        return {
          ...nextConversation,
          title: getConversationTitle(nextConversation.messages),
        }
      }),
    )
  }

  function appendConversationMessage(conversationId: string, message: ChatMessage) {
    patchConversation(conversationId, (conversation) => ({
      ...conversation,
      updatedAt: message.createdAt,
      messages: [...conversation.messages, message],
    }))
  }

  function appendAssistantMessage(content: string, conversationId = activeConversationId) {
    appendConversationMessage(conversationId, createChatMessage('assistant', content))
  }

  function createNewConversation() {
    if (isCurrentConversationFresh) {
      return
    }

    const conversation = createConversation()

    setConversations((currentConversations) => [conversation, ...currentConversations])
    setActiveConversationId(conversation.id)
    setAiPrompt('')
    setIsHistoryOpen(false)
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return
    }

    event.preventDefault()
    void handleAiArrange()
  }

  function toggleSuggestionSelection(suggestionId: string) {
    setSuggestionDialogState((currentState) => {
      if (!currentState) {
        return currentState
      }

      const selectedIds = currentState.selectedIds.includes(suggestionId)
        ? currentState.selectedIds.filter((id) => id !== suggestionId)
        : [...currentState.selectedIds, suggestionId]

      return {
        ...currentState,
        selectedIds,
      }
    })
  }

  function handleApplyAiSuggestions(mode: 'all' | 'selected') {
    if (!suggestionDialogState) {
      return
    }

    const suggestionsToAdd =
      mode === 'all'
        ? suggestionDialogState.suggestions
        : suggestionDialogState.suggestions.filter((suggestion) =>
            suggestionDialogState.selectedIds.includes(suggestion.id),
          )

    if (suggestionsToAdd.length === 0) {
      return
    }

    onAddTodos(
      suggestionsToAdd.map((suggestion) => ({
        id: suggestion.id,
        title: suggestion.title,
        time: suggestion.time,
        repeat: suggestion.repeat,
        createdDate: suggestion.createdDate,
      })),
    )
    appendAssistantMessage(`已加入 ${suggestionsToAdd.length} 条 Todo。需要的话，我还可以继续帮你细化后续安排。`)
    setSuggestionDialogState(null)
  }

  function handleToggleAllAiSuggestions() {
    setSuggestionDialogState((currentState) => {
      if (!currentState) {
        return currentState
      }

      const shouldClear = currentState.selectedIds.length === currentState.suggestions.length

      return {
        ...currentState,
        selectedIds: shouldClear
          ? []
          : currentState.suggestions.map((suggestion) => suggestion.id),
      }
    })
  }

  function handleOpenSuggestionEditor(suggestionId: string) {
    if (!suggestionDialogState) {
      return
    }

    const suggestion = suggestionDialogState.suggestions.find((item) => item.id === suggestionId)

    if (!suggestion) {
      return
    }

    setSuggestionEditorState({
      suggestionId,
      draft: {
        title: suggestion.title,
        date: suggestion.createdDate,
        time: suggestion.time,
        repeat: suggestion.repeat,
      },
    })
  }

  function handleSuggestionEditorChange<Key extends keyof DraftTodo>(
    key: Key,
    value: DraftTodo[Key],
  ) {
    setSuggestionEditorState((currentState) =>
      currentState
        ? {
            ...currentState,
            draft: {
              ...currentState.draft,
              [key]: value,
            },
          }
        : currentState,
    )
  }

  function handleSaveSuggestionEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!suggestionEditorState) {
      return
    }

    const title = suggestionEditorState.draft.title.trim()

    if (!title) {
      return
    }

    setSuggestionDialogState((currentState) => {
      if (!currentState) {
        return currentState
      }

      return {
        ...currentState,
        suggestions: currentState.suggestions.map((suggestion) =>
          suggestion.id === suggestionEditorState.suggestionId
            ? {
                ...suggestion,
                title,
                createdDate: suggestionEditorState.draft.date,
                time: suggestionEditorState.draft.time,
                repeat: suggestionEditorState.draft.repeat,
              }
            : suggestion,
        ),
      }
    })

    setSuggestionEditorState(null)
  }

  function toggleDeleteCandidateSelection(todoId: string) {
    setDeleteSuggestionDialogState((currentState) => {
      if (!currentState) {
        return currentState
      }

      const selectedIds = currentState.selectedIds.includes(todoId)
        ? currentState.selectedIds.filter((id) => id !== todoId)
        : [...currentState.selectedIds, todoId]

      return {
        ...currentState,
        selectedIds,
      }
    })
  }

  function handleApplyAiDeleteCandidates(mode: 'all' | 'selected') {
    if (!deleteSuggestionDialogState) {
      return
    }

    const todoIdsToDelete =
      mode === 'all'
        ? deleteSuggestionDialogState.candidates.map((candidate) => candidate.todoId)
        : deleteSuggestionDialogState.selectedIds

    if (todoIdsToDelete.length === 0) {
      return
    }

    onDeleteTodos(todoIdsToDelete)
    appendAssistantMessage(`已删除 ${todoIdsToDelete.length} 条 Todo。`)
    setDeleteSuggestionDialogState(null)
  }

  function toggleAdjustmentSelection(todoId: string) {
    setAdjustmentDialogState((currentState) => {
      if (!currentState) {
        return currentState
      }

      const selectedIds = currentState.selectedIds.includes(todoId)
        ? currentState.selectedIds.filter((id) => id !== todoId)
        : [...currentState.selectedIds, todoId]

      return {
        ...currentState,
        selectedIds,
      }
    })
  }

  function handleApplyAiAdjustments(mode: 'all' | 'selected') {
    if (!adjustmentDialogState) {
      return
    }

    const suggestionsToApply =
      mode === 'all'
        ? adjustmentDialogState.suggestions
        : adjustmentDialogState.suggestions.filter((suggestion) =>
            adjustmentDialogState.selectedIds.includes(suggestion.todoId),
          )

    if (suggestionsToApply.length === 0) {
      return
    }

    onUpdateTodos(
      suggestionsToApply.map((suggestion) => ({
        id: suggestion.todoId,
        title: suggestion.newTitle,
        createdDate: suggestion.newDate,
        time: suggestion.newTime,
        repeat: suggestion.newRepeat,
      })),
    )
    appendAssistantMessage(`已应用 ${suggestionsToApply.length} 条 Todo 调整建议。`)
    setAdjustmentDialogState(null)
  }

  async function handleAiArrange() {
    const prompt = aiPrompt.trim()

    if (!prompt || isAiLoading || !activeConversation) {
      return
    }

    const userMessage = createChatMessage('user', prompt)
    const targetConversationId = activeConversation.id
    const nextMessages = [...activeConversation.messages, userMessage]
    appendConversationMessage(targetConversationId, userMessage)

    setAiPrompt('')
    setIsAiLoading(true)

    try {
      const baseDate = new Date()
      const todoContext = todos.map((todo) => ({
        id: todo.id,
        title: todo.title,
        date: todo.createdDate,
        time: todo.time,
        repeat: todo.repeat,
      }))
      const routeHint = [
        !isExplicitTodoRequest(prompt) && !isLearningRequest(prompt)
          ? '本轮更像普通知识问答，请优先返回 reply。'
          : null,
        isLearningRequest(prompt) && !isExplicitTodoRequest(prompt)
          ? '本轮涉及学习主题，但用户还没有明确要求生成 Todo，请优先返回 reply，并追问是否需要继续制定 Todo 计划。'
          : null,
        isExplicitTodoRequest(prompt)
          ? '用户已经明确要求制定计划或操作 Todo，如有足够信息请直接返回 add、delete 或 adjust。'
          : null,
      ]
        .filter(Boolean)
        .join(' ')

      const response = await fetch(DEEPSEEK_PROXY_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: DEEPSEEK_SYSTEM_PROMPT,
            },
            {
              role: 'system',
              content: `今天日期：${formatDateKey(baseDate)}。当前页面选中日期：${selectedDateKey}。当前 Todo 列表 JSON：${JSON.stringify(todoContext)}。${routeHint}`,
            },
            ...nextMessages.map((message) => ({
              role: message.role,
              content: message.content,
            })),
          ],
        }),
      })

      if (!response.ok) {
        let errorMessage = `DeepSeek 请求失败：${response.status}`

        try {
          const errorPayload = (await response.json()) as { error?: string }

          if (typeof errorPayload.error === 'string' && errorPayload.error.trim()) {
            errorMessage = errorPayload.error.trim()
          }
        } catch {
          // Ignore proxy error body parse failures and fall back to status text.
        }

        throw new Error(errorMessage)
      }

      const payload = (await response.json()) as DeepSeekResponse
      const content = payload.choices?.[0]?.message?.content?.trim()

      if (!content) {
        throw new Error('DeepSeek 没有返回可解析内容')
      }

      const { parsed, usedFallback } = parseAiResponse(content)
      const summary =
        typeof parsed.summary === 'string' && parsed.summary.trim()
          ? parsed.summary.trim()
          : '小知已经完成本次分析。'
      const replyText = typeof parsed.reply === 'string' ? parsed.reply.trim() : ''

      if (
        (usedFallback || parsed.action === 'reply') &&
        replyText &&
        claimsTodoMutationSucceeded(replyText)
      ) {
        throw new Error('小知这次声称已经执行了 Todo 变更，但没有返回可执行的结构化结果，所以前端不会真的修改待办。请重试一次，我会重新整理成可确认的 Todo 建议。')
      }

      if (parsed.action === 'delete') {
        const candidates = sanitizeAiDeleteCandidates(parsed.items, todos)

        if (candidates.length === 0) {
          throw new Error('小知没有识别出可删除的 Todo')
        }

        setDeleteSuggestionDialogState({
          summary,
          candidates,
          selectedIds: candidates.map((candidate) => candidate.todoId),
        })
        appendAssistantMessage(
          `我找到了 ${candidates.length} 条可处理的 Todo 删除候选。你确认后我再删除。`,
          targetConversationId,
        )
      } else if (parsed.action === 'adjust') {
        const suggestions = resolveAdjustmentTimeConflicts(
          sanitizeAiAdjustments(parsed.items, todos, selectedDateKey, baseDate),
          todos,
        )

        if (suggestions.length === 0) {
          throw new Error('小知没有生成可应用的 Todo 调整建议')
        }

        setAdjustmentDialogState({
          summary,
          suggestions,
          selectedIds: suggestions.map((suggestion) => suggestion.todoId),
        })
        appendAssistantMessage(
          `我已经分析了当前安排，并整理出 ${suggestions.length} 条调整建议，确认后就能直接应用。`,
          targetConversationId,
        )
      } else if (parsed.action === 'add') {
        const suggestions = resolveSuggestionTimeConflicts(
          sanitizeAiSuggestions(parsed.items, selectedDateKey, baseDate),
          todos,
        )

        if (suggestions.length === 0) {
          throw new Error('小知没有生成可加入的 Todo 事项')
        }

        setSuggestionDialogState({
          summary,
          suggestions,
          selectedIds: suggestions.map((suggestion) => suggestion.id),
        })
        appendAssistantMessage(
          `我已经为你整理出 ${suggestions.length} 条 Todo 建议。你可以先挑选，再决定是否加入。`,
          targetConversationId,
        )
      } else {
        appendAssistantMessage(
          typeof parsed.reply === 'string' && parsed.reply.trim() ? parsed.reply.trim() : summary,
          targetConversationId,
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '小知分析失败，请稍后重试。'
      appendAssistantMessage(`小知这次处理失败：${message}`, targetConversationId)
    } finally {
      setIsAiLoading(false)
    }
  }

  return (
    <>
      <section className="assistant-card assistant-panel" aria-labelledby="assistant-title">
        <div className="assistant-header">
          <div>
            <p className="section-label">AI 助手 --- 小知</p>
          </div>

          <div className="assistant-header-actions">
            <button
              type="button"
              className="assistant-action-button"
              onClick={createNewConversation}
              disabled={isCurrentConversationFresh}
            >
              新对话
            </button>
            <button
              type="button"
              className="assistant-action-button"
              onClick={() => setIsHistoryOpen((currentValue) => !currentValue)}
              aria-expanded={isHistoryOpen}
              aria-controls="conversation-history-panel"
            >
              历史对话
            </button>
          </div>
        </div>

        {isHistoryOpen ? (
          <aside id="conversation-history-panel" className="conversation-history-panel">
            <div className="conversation-history-header">
              <div>
                <p className="section-label">历史会话</p>
                <h3>切换到任意对话</h3>
              </div>
              <button
                type="button"
                className="dismiss-button history-dismiss-button"
                onClick={() => setIsHistoryOpen(false)}
              >
                关闭
              </button>
            </div>

            <button
              type="button"
              className="conversation-create-button"
              onClick={createNewConversation}
              disabled={isCurrentConversationFresh}
            >
              开始新的对话
            </button>

            <div className="conversation-history-list">
              {conversations
                .slice()
                .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
                .map((conversation) => {
                  const isActive = conversation.id === activeConversationId
                  const previewMessage =
                    conversation.messages[conversation.messages.length - 1]?.content ?? '暂无内容'

                  return (
                    <button
                      key={conversation.id}
                      type="button"
                      className={`conversation-history-item${isActive ? ' is-active' : ''}`}
                      onClick={() => {
                        setActiveConversationId(conversation.id)
                        setIsHistoryOpen(false)
                      }}
                    >
                      <span className="conversation-history-top">
                        <strong>{conversation.title}</strong>
                        <small>{formatConversationTime(conversation.updatedAt)}</small>
                      </span>
                      <span className="conversation-history-preview">{truncateText(previewMessage, 40)}</span>
                    </button>
                  )
                })}
            </div>
          </aside>
        ) : null}

        <div ref={chatContainerRef} className="assistant-chat">
          {chatMessages.map((message) => (
            <article
              key={message.id}
              className={`chat-bubble ${message.role === 'user' ? 'is-user' : 'is-assistant'}`}
            >
              <span className="chat-role">
                {message.role === 'user' ? '你' : '小知'}
              </span>
              <p>{message.content}</p>
            </article>
          ))}

          {isAiLoading ? (
            <article className="chat-bubble is-assistant is-loading">
              <span className="chat-role">小知</span>
              <p>正在思考中...</p>
            </article>
          ) : null}
        </div>

        <label className="assistant-input-wrap">
          <textarea
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            onKeyDown={handlePromptKeyDown}
            placeholder="问知识问题、安排今天计划、生成学习 Todo，或者让我帮你分析当前待办"
            rows={5}
          />
          <button
            type="button"
            className="primary-button assistant-submit"
            onClick={handleAiArrange}
            disabled={isAiLoading || !aiPrompt.trim()}
            aria-label={isAiLoading ? '小知正在回答' : '发送给小知'}
            title={isAiLoading ? '小知正在回答' : '发送给小知'}
          >
            {isAiLoading ? (
              <svg viewBox="0 0 24 24" aria-hidden="true" className="assistant-submit-spinner">
                <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="30 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 4l5.5 5.5-1.41 1.41-3.09-3.08V20h-2V7.83L7.91 10.9 6.5 9.5 12 4z" fill="currentColor" />
              </svg>
            )}
          </button>
        </label>
      </section>

      {suggestionDialogState ? (
        <div
          className="composer-overlay"
          role="presentation"
          onClick={() => setSuggestionDialogState(null)}
        >
          <div
            className="composer-panel suggestion-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggestion-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="composer-header">
              <div>
                <p className="section-label">小知建议</p>
                <h2 id="suggestion-dialog-title">请选择要加入的 Todo</h2>
              </div>
              <button
                type="button"
                className="dismiss-button"
                onClick={() => setSuggestionDialogState(null)}
              >
                关闭
              </button>
            </div>

            <div className="confirm-copy">
              <p>{suggestionDialogState.summary}</p>
              <span>你可以全部加入，也可以只勾选部分事项后再加入 Todo。</span>
            </div>

            <div className="suggestion-toolbar">
              <label className="select-all-toggle">
                <input
                  type="checkbox"
                  checked={
                    suggestionDialogState.suggestions.length > 0 &&
                    suggestionDialogState.selectedIds.length === suggestionDialogState.suggestions.length
                  }
                  onChange={handleToggleAllAiSuggestions}
                />
                <span>全选</span>
              </label>
              <button
                type="button"
                className="primary-button"
                onClick={() => handleApplyAiSuggestions('selected')}
                disabled={suggestionDialogState.selectedIds.length === 0}
              >
                加入 Todo
              </button>
            </div>

            <ul className="suggestion-list">
              {suggestionDialogState.suggestions.map((suggestion) => {
                const isChecked = suggestionDialogState.selectedIds.includes(suggestion.id)

                return (
                  <li key={suggestion.id} className="suggestion-item">
                    <div className="suggestion-row">
                      <label className="suggestion-check">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSuggestionSelection(suggestion.id)}
                        />
                        <span className="suggestion-copy">
                          <strong>{suggestion.title}</strong>
                          <span>
                            {suggestion.createdDate} · {suggestion.time} · {repeatLabelMap[suggestion.repeat]}
                          </span>
                          <small>{suggestion.reason}</small>
                        </span>
                      </label>

                      <button
                        type="button"
                        className="icon-button suggestion-detail-button"
                        aria-label={`编辑建议 ${suggestion.title}`}
                        title="调整建议详情"
                        onClick={() => handleOpenSuggestionEditor(suggestion.id)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M12 3a9 9 0 1 0 9 9 9.01 9.01 0 0 0-9-9Zm1 13h-2v-2h2Zm1.71-5.29-.9.92A1.49 1.49 0 0 0 13 13h-2v-.5a2.5 2.5 0 0 1 .73-1.77l1.24-1.26a1 1 0 1 0-1.68-.75H9.3a3 3 0 1 1 5.41 2Z" />
                        </svg>
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : null}

      {suggestionEditorState ? (
        <div
          className="composer-overlay"
          role="presentation"
          onClick={() => setSuggestionEditorState(null)}
        >
          <div
            className="composer-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggestion-editor-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="composer-header">
              <div>
                <p className="section-label">调整小知建议</p>
                <h2 id="suggestion-editor-title">修改后再加入 Todo</h2>
              </div>
              <button
                type="button"
                className="dismiss-button"
                onClick={() => setSuggestionEditorState(null)}
              >
                关闭
              </button>
            </div>

            <form className="composer-form" onSubmit={handleSaveSuggestionEdit}>
              <label>
                <span>事项名称</span>
                <input
                  type="text"
                  value={suggestionEditorState.draft.title}
                  onChange={(event) => handleSuggestionEditorChange('title', event.target.value)}
                />
              </label>

              <div className="form-row">
                <label>
                  <span>日期</span>
                  <input
                    type="date"
                    value={suggestionEditorState.draft.date}
                    onChange={(event) => handleSuggestionEditorChange('date', event.target.value)}
                  />
                </label>

                <label>
                  <span>时间</span>
                  <input
                    type="time"
                    value={suggestionEditorState.draft.time}
                    onChange={(event) => handleSuggestionEditorChange('time', event.target.value)}
                  />
                </label>

                <label>
                  <span>重复规则</span>
                  <select
                    value={suggestionEditorState.draft.repeat}
                    onChange={(event) =>
                      handleSuggestionEditorChange('repeat', event.target.value as RepeatRule)
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
                  onClick={() => setSuggestionEditorState(null)}
                >
                  取消
                </button>
                <button type="submit" className="primary-button">
                  保存建议修改
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteSuggestionDialogState ? (
        <div
          className="composer-overlay"
          role="presentation"
          onClick={() => setDeleteSuggestionDialogState(null)}
        >
          <div
            className="composer-panel suggestion-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-delete-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="composer-header">
              <div>
                <p className="section-label">小知删除建议</p>
                <h2 id="ai-delete-dialog-title">请选择要删除的 Todo</h2>
              </div>
              <button
                type="button"
                className="dismiss-button"
                onClick={() => setDeleteSuggestionDialogState(null)}
              >
                关闭
              </button>
            </div>

            <div className="confirm-copy">
              <p>{deleteSuggestionDialogState.summary}</p>
              <span>小知已根据你的条件筛出候选 Todo。请确认是否删除。</span>
            </div>

            <ul className="suggestion-list">
              {deleteSuggestionDialogState.candidates.map((candidate) => {
                const isChecked = deleteSuggestionDialogState.selectedIds.includes(candidate.todoId)

                return (
                  <li key={candidate.todoId} className="suggestion-item">
                    <label className="suggestion-check">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleDeleteCandidateSelection(candidate.todoId)}
                      />
                      <span className="suggestion-copy">
                        <strong>{candidate.title}</strong>
                        <span>
                          {candidate.createdDate} · {candidate.time} · {repeatLabelMap[candidate.repeat]}
                        </span>
                        <small>{candidate.reason}</small>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>

            <div className="confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setDeleteSuggestionDialogState((currentState) =>
                    currentState
                      ? {
                          ...currentState,
                          selectedIds: currentState.candidates.map((candidate) => candidate.todoId),
                        }
                      : currentState,
                  )
                }
              >
                全选
              </button>
              <button
                type="button"
                className="secondary-button danger-button"
                onClick={() => handleApplyAiDeleteCandidates('selected')}
                disabled={deleteSuggestionDialogState.selectedIds.length === 0}
              >
                删除勾选项
              </button>
              <button
                type="button"
                className="primary-button danger-button"
                onClick={() => handleApplyAiDeleteCandidates('all')}
              >
                全部删除
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {adjustmentDialogState ? (
        <div
          className="composer-overlay"
          role="presentation"
          onClick={() => setAdjustmentDialogState(null)}
        >
          <div
            className="composer-panel suggestion-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-adjust-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="composer-header">
              <div>
                <p className="section-label">小知调整建议</p>
                <h2 id="ai-adjust-dialog-title">请选择是否接受这些修改</h2>
              </div>
              <button
                type="button"
                className="dismiss-button"
                onClick={() => setAdjustmentDialogState(null)}
              >
                关闭
              </button>
            </div>

            <div className="confirm-copy">
              <p>{adjustmentDialogState.summary}</p>
              <span>小知已分析当前安排，并给出可直接应用的 Todo 修改建议。</span>
            </div>

            <ul className="suggestion-list">
              {adjustmentDialogState.suggestions.map((suggestion) => {
                const isChecked = adjustmentDialogState.selectedIds.includes(suggestion.todoId)

                return (
                  <li key={suggestion.todoId} className="suggestion-item">
                    <label className="suggestion-check">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleAdjustmentSelection(suggestion.todoId)}
                      />
                      <span className="suggestion-copy">
                        <strong>{suggestion.currentTitle}</strong>
                        <span>
                          当前：{suggestion.currentDate} · {suggestion.currentTime} · {repeatLabelMap[suggestion.currentRepeat]}
                        </span>
                        <span>
                          建议：{suggestion.newTitle} · {suggestion.newDate} · {suggestion.newTime} · {repeatLabelMap[suggestion.newRepeat]}
                        </span>
                        <small>{suggestion.reason}</small>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>

            <div className="confirm-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setAdjustmentDialogState((currentState) =>
                    currentState
                      ? {
                          ...currentState,
                          selectedIds: currentState.suggestions.map((suggestion) => suggestion.todoId),
                        }
                      : currentState,
                  )
                }
              >
                全选
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => handleApplyAiAdjustments('selected')}
                disabled={adjustmentDialogState.selectedIds.length === 0}
              >
                接受勾选修改
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => handleApplyAiAdjustments('all')}
              >
                接受全部修改
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}