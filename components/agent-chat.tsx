"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Plus,
  Clock,
  MoreHorizontal,
  X,
  ChevronDown,
  ArrowUp,
  AtSign,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "@/components/markdown-content"

const OLLAMA_BASE = "http://localhost:11434"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
}

export function AgentChat() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const userScrolledUp = useRef(false)

  const hasInput = input.trim().length > 0

  useEffect(() => {
    fetch(`${OLLAMA_BASE}/api/tags`)
      .then((r) => r.json())
      .then((data) => {
        const names: string[] = (data.models ?? []).map(
          (m: { name: string }) => m.name,
        )
        setModels(names)
        if (names.length > 0) setSelectedModel(names[0])
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (!userScrolledUp.current || distFromBottom < 80) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!hasInput || isStreaming || !selectedModel) return
    const userContent = input.trim()
    setInput("")

    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: userContent },
      { id: assistantId, role: "assistant", content: "" },
    ])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userContent },
          ],
          stream: true,
        }),
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split("\n")) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line)
            const delta: string = parsed.message?.content ?? ""
            if (delta) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + delta }
                    : m,
                ),
              )
            }
          } catch {}
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content:
                    "Error: could not reach Ollama. Is it running on port 11434?",
                }
              : m,
          ),
        )
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [hasInput, isStreaming, selectedModel, input, messages])

  function stopStreaming() {
    abortRef.current?.abort()
  }

  function newConversation() {
    abortRef.current?.abort()
    setMessages([])
    setInput("")
    setIsStreaming(false)
  }

  return (
    <div className="flex h-full flex-col bg-[#141414] border-l border-[#2d2d2d]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#2d2d2d] px-3 py-2">
        <span className="text-sm font-semibold text-[#e0e0e0]">Agent</span>
        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[#888888] hover:bg-[#2d2d2d] hover:text-[#e0e0e0]"
                onClick={newConversation}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New conversation</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[#888888] hover:bg-[#2d2d2d] hover:text-[#e0e0e0]"
              >
                <Clock className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">History</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[#888888] hover:bg-[#2d2d2d] hover:text-[#e0e0e0]"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">More</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[#888888] hover:bg-[#2d2d2d] hover:text-[#e0e0e0]"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Close</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={() => {
          const el = scrollRef.current
          if (!el) return
          userScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > 80
        }}
        className="flex-1 overflow-y-auto
          [&::-webkit-scrollbar]:w-[5px]
          [&::-webkit-scrollbar-track]:bg-transparent
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb]:bg-[#3d3d3d]
          [&::-webkit-scrollbar-thumb:hover]:bg-[#555555]"
      >
        <div className="flex flex-col gap-4 px-3 py-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 text-center mt-16">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#2d2d2d]">
                <AtSign className="h-4 w-4 text-[#888888]" />
              </div>
              <p className="text-sm font-medium text-[#888888]">AXYR AGENT</p>
              <p className="max-w-[200px] text-xs text-[#555555]">
                {models.length === 0
                  ? "Ollama not detected. Start it to use local models."
                  : "Ask anything about your project or codebase"}
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[85%] rounded-lg rounded-tr-none bg-[#2d2d2d] px-3 py-2 text-xs leading-relaxed text-[#cccccc] whitespace-pre-wrap">
                    {msg.content}
                  </div>
                ) : (
                  <div className="w-full text-xs text-[#cccccc]">
                    {msg.content ? (
                      <MarkdownContent content={msg.content} />
                    ) : (
                      <span className="flex items-center gap-1 text-[#555555] px-1 py-2">
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
                          style={{ animationDelay: "0ms" }}
                        />
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-current animate-bounce"
                          style={{ animationDelay: "300ms" }}
                        />
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-[#2d2d2d] p-3">
        <div className="rounded-lg border border-[#3d3d3d] bg-[#1e1e1e] focus-within:border-[#555555] transition-colors">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder="Ask anything, @ to mention, / for actions"
            rows={3}
            disabled={isStreaming}
            className={cn(
              "w-full resize-none bg-transparent px-3 pt-3 pb-1 text-xs text-[#cccccc]",
              "placeholder:text-[#555555] outline-none disabled:opacity-50",
            )}
          />

          <div className="flex items-center justify-between px-2 pb-2 pt-1">
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-[#666666] hover:bg-[#2d2d2d] hover:text-[#cccccc]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Add context</TooltipContent>
              </Tooltip>

              {/* Model selector */}
              <div className="relative">
                <button
                  onClick={() => setShowModelMenu((v) => !v)}
                  className="flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-[#666666] hover:bg-[#2d2d2d] hover:text-[#cccccc] transition-colors"
                >
                  <span className="max-w-[130px] truncate">
                    {selectedModel || (models.length === 0 ? "no models" : "select model")}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>

                {showModelMenu && models.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-52 rounded-md border border-[#3d3d3d] bg-[#1e1e1e] py-1 shadow-xl z-50">
                    {models.map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setSelectedModel(m)
                          setShowModelMenu(false)
                        }}
                        className={cn(
                          "w-full px-3 py-1.5 text-left text-[10px] transition-colors truncate",
                          m === selectedModel
                            ? "bg-[#007acc]/20 text-[#cccccc]"
                            : "text-[#888888] hover:bg-[#2d2d2d] hover:text-[#cccccc]",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {isStreaming ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    onClick={stopStreaming}
                    className="h-6 w-6 rounded-md bg-[#2d2d2d] text-[#cccccc] hover:bg-[#3d3d3d] transition-colors"
                  >
                    <Loader2
                      className="h-3.5 w-3.5"
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Click to stop</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    disabled={!hasInput || !selectedModel}
                    onClick={sendMessage}
                    className={cn(
                      "h-6 w-6 rounded-md transition-all",
                      hasInput && selectedModel
                        ? "bg-white text-black hover:bg-gray-200"
                        : "bg-[#2d2d2d] text-[#555555] cursor-not-allowed",
                    )}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Send message</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
