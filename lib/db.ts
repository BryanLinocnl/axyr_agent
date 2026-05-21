import Dexie, { type Table } from "dexie"

export type StoredMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  commandResults?: {
    tag: string
    arg: string
    status: "ok" | "error"
    output?: string
  }[]
}

export type Conversation = {
  id: string
  title: string
  timestamp: number
  rootPath: string
  messages: StoredMessage[]
}

export type Template = {
  id: string
  name: string
  description: string
  content: string
  enabled: boolean
  createdAt: number
}

export type CustomModel = {
  id: string
  name: string
  provider: "groq"
  apiKey: string
  enabled: boolean
  createdAt: number
}

class AgentDB extends Dexie {
  conversations!: Table<Conversation>
  templates!: Table<Template>
  customModels!: Table<CustomModel>

  constructor() {
    super("axyr-agent")
    this.version(1).stores({
      conversations: "id, timestamp",
    })
    this.version(2).stores({
      conversations: "id, timestamp",
      templates: "id, createdAt",
    })
    this.version(3).stores({
      conversations: "id, timestamp",
      templates: "id, createdAt",
      customModels: "id, createdAt",
    })
  }
}

export const db = new AgentDB()
