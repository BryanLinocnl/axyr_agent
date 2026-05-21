"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  Plus,
  Clock,
  MoreHorizontal,
  X,
  ChevronDown,
  ChevronRight,
  ArrowUp,
  AtSign,
  Loader2,
  Square,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { MarkdownContent } from "@/components/markdown-content"
import { db, type Conversation, type CustomModel } from "@/lib/db"

const OLLAMA_BASE = "http://localhost:11434"

const SYSTEM_PROMPT = `You are AXYR, an autonomous development agent. You create, edit, and run code in the user's project.

## MANDATORY RULES
- Act immediately. NEVER explain what you are going to do before doing it.
- Use ONLY the commands below with the exact tags shown. ALWAYS close every tag.
- ALL tags MUST be UPPERCASE. [write] is WRONG. [WRITE] is correct.
- ALL file paths are ALWAYS relative to the project root directory shown below.
- NEVER use [CD] for file or directory operations. [CD] is ONLY allowed immediately before a [RUN] command that must execute inside a subdirectory.
- The "project root" means the root directory listed below — NEVER create a folder named "root".
- To create a file WITH content, ALWAYS use [WRITE] — never create empty files.
- After all commands are done, write a brief plain-text summary of what was done.
- Do NOT wrap the summary in any tags. Just write it as plain text.
- If a command fails, report the error and stop.

## PROJECT CONTEXT
Root directory: {{ROOT_PATH}}

## AVAILABLE COMMANDS

[MKDIR]path/to/dir[/MKDIR]
[CD]path/to/dir[/CD]
[DELETE]path/to/file-or-dir[/DELETE]

[WRITE]path/to/file.ext
ALL file content goes here, between the tags.
Every line of content must be inside, before [/WRITE].
[/WRITE]

[APPEND]path/to/file.ext
content to add at the end
[/APPEND]

[EDIT]path/to/file.ext
---FIND
exact text to find
---REPLACE
replacement text
[/EDIT]

[READ]path/to/file.ext[/READ]
[LS][/LS]
[LS]path/to/dir[/LS]

[RUN]shell command here[/RUN]

## WRITE RULES — CRITICAL
- ALL file content MUST be inside [WRITE]...[/WRITE]. NEVER put content after [/WRITE].
- The line immediately after [WRITE] is the file path. Content starts on the line after that.
- NEVER use markdown code fences inside [WRITE] tags.
- NEVER output [WRITE]filename[/WRITE] with empty content — write the actual code.

Correct example:
[WRITE]index.html
<!DOCTYPE html>
<html>
<head><title>Page</title></head>
<body><h1>Hello</h1></body>
</html>
[/WRITE]

Wrong — empty, DO NOT DO THIS:
[WRITE]index.html[/WRITE]

- ALWAYS close every tag: [/WRITE], [/APPEND], [/MKDIR], etc.
- NEVER invent new tags. Use only the tags listed above.

## MOVING A FILE
There is no MOVE command. To move a file, do: READ it, WRITE to the new path, then DELETE the old path.
Example — move foo/bar.txt to baz/bar.txt:
[READ]foo/bar.txt[/READ]
[WRITE]baz/bar.txt
<content from READ>
[/WRITE]
[DELETE]foo/bar.txt[/DELETE]`

type CommandResult = {
  tag: string
  arg: string
  status: "ok" | "error"
  output?: string
}

type LiveCommand = {
  tag: string
  label: string
  done: boolean
}

type MessageStats = {
  durationMs: number
  tokensGenerated: number
  tokensPerSec: number
}

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  executing?: boolean
  commandResults?: CommandResult[]
  liveCommands?: LiveCommand[]
  thinking?: string
  thinkingDone?: boolean
  stats?: MessageStats
  streamStartMs?: number
  liveTokens?: number
}

function parseLiveCommands(text: string): LiveCommand[] {
  const items: Array<{ pos: number; cmd: LiveCommand }> = []
  for (const tag of COMMAND_TAGS) {
    const openTag = `[${tag}]`
    const closeTag = `[/${tag}]`
    let idx = 0
    while (true) {
      const openIdx = text.indexOf(openTag, idx)
      if (openIdx === -1) break
      const contentStart = openIdx + openTag.length
      const closeIdx = text.indexOf(closeTag, contentStart)
      const content = closeIdx === -1 ? text.slice(contentStart) : text.slice(contentStart, closeIdx)
      const firstLine = content.split("\n")[0].trim()
      items.push({ pos: openIdx, cmd: { tag, label: firstLine, done: closeIdx !== -1 } })
      idx = closeIdx === -1 ? text.length : closeIdx + closeTag.length
    }
  }
  return items.sort((a, b) => a.pos - b.pos).map((i) => i.cmd)
}

const COMMAND_TAGS = ["MKDIR", "CD", "DELETE", "WRITE", "APPEND", "EDIT", "READ", "LS", "RUN"]

type ParsedCommand = { tag: string; arg: string; index: number }

function parseCommands(text: string): ParsedCommand[] {
  const results: ParsedCommand[] = []
  for (const tag of COMMAND_TAGS) {
    const regex = new RegExp(`\\[${tag}\\]([\\s\\S]*?)\\[\\/${tag}\\]`, "g")
    let match
    while ((match = regex.exec(text)) !== null) {
      results.push({ tag, arg: match[1], index: match.index })
    }
  }
  return results.sort((a, b) => a.index - b.index)
}

function stripCommandBlocks(text: string): string {
  const tagAlt = COMMAND_TAGS.join("|")
  return text
    // Remove complete [TAG]...[/TAG] blocks
    .replace(new RegExp(`\\[(${tagAlt})\\][\\s\\S]*?\\[\\/(${tagAlt})\\]`, "g"), "")
    // Remove partial/unclosed blocks (from open tag to end of string)
    .replace(new RegExp(`\\[(${tagAlt})\\][\\s\\S]*$`), "")
    // Strip [resumo]/[/resumo] markers but keep content inside
    .replace(/\[resumo\]/gi, "")
    .replace(/\[\/resumo\]/gi, "")
    .trim()
}

function normalizePath(path: string): string {
  const parts = path.split("/")
  const out: string[] = []
  for (const p of parts) {
    if (p === "..") out.pop()
    else if (p !== ".") out.push(p)
  }
  return out.join("/") || "/"
}

function extractThinking(text: string): { thinking: string; mainContent: string; thinkingDone: boolean } {
  const startIdx = text.indexOf("<think>")
  if (startIdx === -1) return { thinking: "", mainContent: text, thinkingDone: false }
  const endIdx = text.indexOf("</think>", startIdx)
  if (endIdx === -1) {
    return {
      thinking: text.slice(startIdx + 7),
      mainContent: text.slice(0, startIdx).trim(),
      thinkingDone: false,
    }
  }
  return {
    thinking: text.slice(startIdx + 7, endIdx),
    mainContent: (text.slice(0, startIdx) + text.slice(endIdx + 8)).trim(),
    thinkingDone: true,
  }
}

function resolvePath(cwd: string, rel: string): string {
  const r = rel.trim()
  if (!r || r === ".") return cwd
  const raw = r.startsWith("/") ? r : `${cwd.replace(/\/$/, "")}/${r}`
  return normalizePath(raw)
}

async function executeCommands(
  commands: ParsedCommand[],
  startCwd: string,
): Promise<{ results: CommandResult[]; finalCwd: string }> {
  const w = window as unknown as { __TAURI_INTERNALS__?: unknown }
  if (!w.__TAURI_INTERNALS__) {
    return {
      results: [{ tag: "ERROR", arg: "", status: "error", output: "Not running in Tauri" }],
      finalCwd: startCwd,
    }
  }

  const { mkdir, writeTextFile, readTextFile, readDir, remove } =
    await import("@tauri-apps/plugin-fs")

  let cwd = startCwd
  const results: CommandResult[] = []

  for (const cmd of commands) {
    try {
      switch (cmd.tag) {
        case "MKDIR": {
          await mkdir(resolvePath(cwd, cmd.arg), { recursive: true })
          results.push({ tag: cmd.tag, arg: cmd.arg.trim(), status: "ok" })
          break
        }
        case "CD": {
          cwd = resolvePath(cwd, cmd.arg)
          results.push({ tag: cmd.tag, arg: cmd.arg.trim(), status: "ok" })
          break
        }
        case "DELETE": {
          await remove(resolvePath(cwd, cmd.arg), { recursive: true })
          results.push({ tag: cmd.tag, arg: cmd.arg.trim(), status: "ok" })
          break
        }
        case "WRITE": {
          const lines = cmd.arg.split("\n")
          const file = lines[0].trim()
          if (!file) throw new Error("WRITE: missing filename on first line")
          const contentStart = lines[1]?.trim() === "---" ? 2 : 1
          const content = lines.slice(contentStart).join("\n")
          const path = resolvePath(cwd, file)
          const dir = path.substring(0, path.lastIndexOf("/"))
          if (dir) await mkdir(dir, { recursive: true }).catch(() => { })
          await writeTextFile(path, content)
          results.push({ tag: cmd.tag, arg: file, status: "ok" })
          break
        }
        case "APPEND": {
          const lines = cmd.arg.split("\n")
          const file = lines[0].trim()
          if (!file) throw new Error("APPEND: missing filename on first line")
          const contentStart = lines[1]?.trim() === "---" ? 2 : 1
          const addition = lines.slice(contentStart).join("\n")
          const path = resolvePath(cwd, file)
          let existing = ""
          try { existing = await readTextFile(path) } catch { }
          await writeTextFile(path, existing + addition)
          results.push({ tag: cmd.tag, arg: file, status: "ok" })
          break
        }
        case "EDIT": {
          const findSep = cmd.arg.indexOf("\n---FIND\n")
          if (findSep === -1) {
            // Fallback for models that omit ---FIND/---REPLACE: treat as full overwrite
            const lines = cmd.arg.split("\n")
            const file = lines[0].trim()
            if (!file) throw new Error("EDIT: missing filename")
            const newContent = lines.slice(1).join("\n")
            const path = resolvePath(cwd, file)
            const dir = path.substring(0, path.lastIndexOf("/"))
            if (dir) await mkdir(dir, { recursive: true }).catch(() => { })
            await writeTextFile(path, newContent)
            results.push({ tag: cmd.tag, arg: file, status: "ok" })
            break
          }
          const file = cmd.arg.slice(0, findSep).trim()
          const rest = cmd.arg.slice(findSep + 9)
          const replaceSep = rest.indexOf("\n---REPLACE\n")
          if (replaceSep === -1) throw new Error("Missing ---REPLACE in EDIT")
          const findText = rest.slice(0, replaceSep)
          const replaceText = rest.slice(replaceSep + 13)
          const path = resolvePath(cwd, file)
          const content = await readTextFile(path)
          await writeTextFile(path, content.replace(findText, replaceText))
          results.push({ tag: cmd.tag, arg: file, status: "ok" })
          break
        }
        case "READ": {
          const path = resolvePath(cwd, cmd.arg)
          const content = await readTextFile(path)
          results.push({ tag: cmd.tag, arg: cmd.arg.trim(), status: "ok", output: content })
          break
        }
        case "LS": {
          const target = cmd.arg.trim()
          const path = resolvePath(cwd, target || ".")
          const entries = await readDir(path)
          const output = entries
            .map((e) => `${e.isDirectory ? "📁" : "📄"} ${e.name}`)
            .join("\n")
          results.push({ tag: cmd.tag, arg: target || ".", status: "ok", output })
          break
        }
        case "RUN": {
          const command = cmd.arg.trim()
          const { invoke } = await import("@tauri-apps/api/core")
          const out = await invoke<{ stdout: string; stderr: string; code: number }>(
            "run_shell",
            { command, cwd },
          )
          const output = [out.stdout, out.stderr ? `[stderr] ${out.stderr}` : ""]
            .filter(Boolean)
            .join("\n") || "(no output)"
          results.push({
            tag: cmd.tag,
            arg: command,
            status: out.code === 0 ? "ok" : "error",
            output,
          })
          break
        }
      }
    } catch (e) {
      results.push({ tag: cmd.tag, arg: cmd.arg.trim(), status: "error", output: String(e) })
      break
    }
  }

  return { results, finalCwd: cwd }
}

const CMD_LABEL: Record<string, string> = {
  WRITE: "Write", APPEND: "Append", EDIT: "Edit",
  DELETE: "Delete", MKDIR: "Make dir", CD: "Change dir",
  READ: "Read", LS: "List", RUN: "Run",
}

function formatDuration(ms: number): string {
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${(s / 60).toFixed(2)}min`
}

function LiveStats({ startMs, tokens }: { startMs: number; tokens: number }) {
  const [elapsed, setElapsed] = useState(Date.now() - startMs)

  useEffect(() => {
    const id = setInterval(() => setElapsed(Date.now() - startMs), 200)
    return () => clearInterval(id)
  }, [startMs])

  return (
    <div className="mt-2 flex items-center gap-1.5 text-[9px] text-[#333344]">
      <span>{formatDuration(elapsed)}</span>
      {tokens > 0 && (
        <>
          <span>·</span>
          <span>{tokens} tokens</span>
        </>
      )}
    </div>
  )
}

function ThinkingBlock({ thinking, done }: { thinking: string; done: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const lines = thinking.trim().split("\n").length

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-[#555566] hover:text-[#8888aa] transition-colors"
      >
        <div className={cn(
          "h-2 w-2 shrink-0 rounded-full",
          !done ? "bg-[#555588] animate-pulse" : "bg-[#3d3d5a]",
        )} />
        <span className="text-[11px] font-semibold">
          {done ? "Thought" : "Thinking…"}
        </span>
        <span className="text-[9px] text-[#3d3d55]">
          {lines} line{lines !== 1 ? "s" : ""}
        </span>
        <ChevronRight className={cn("h-2.5 w-2.5 transition-transform", expanded && "rotate-90")} />
      </button>
      {expanded && (
        <div className="mt-1.5 max-h-48 overflow-y-auto rounded border border-[#2a2a40] bg-[#14141e] p-2
          [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:bg-[#3d3d5a] [&::-webkit-scrollbar-track]:bg-transparent">
          <pre className="whitespace-pre-wrap font-mono text-[9px] leading-relaxed text-[#6666aa]">
            {thinking.trim()}
          </pre>
        </div>
      )}
    </div>
  )
}

function CommandTimeline({ results }: { results: CommandResult[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(
    new Set(results.flatMap((r, i) => (r.status === "error" ? [i] : []))),
  )

  function toggle(i: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div className="mt-2 flex flex-col">
      {results.map((r, i) => {
        const isLast = i === results.length - 1
        const hasOutput = Boolean(r.output)
        const isExpand = expanded.has(i)
        return (
          <div key={i} className="flex gap-3">
            <div className="flex w-2 shrink-0 flex-col items-center">
              <div
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full",
                  r.status === "ok" ? "bg-green-500" : "bg-red-400",
                )}
              />
              {!isLast && <div className="w-px flex-1 bg-[#2d2d2d]" />}
            </div>
            <div className={cn("flex-1 min-w-0", !isLast && "mb-3")}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[11px] font-semibold text-[#cccccc]">
                  {CMD_LABEL[r.tag] ?? r.tag}
                </span>
                <span className="truncate font-mono text-[10px] text-[#555555]">
                  {r.arg}
                </span>
                {r.status === "error" && (
                  <span className="ml-auto shrink-0 text-[9px] text-red-400">failed</span>
                )}
              </div>
              {hasOutput && (
                <button
                  onClick={() => toggle(i)}
                  className="mt-0.5 flex items-center gap-0.5 text-[9px] text-[#444444] hover:text-[#777777] transition-colors"
                >
                  <ChevronRight className={cn("h-2.5 w-2.5 transition-transform", isExpand && "rotate-90")} />
                  {isExpand ? "Hide" : "Show output"}
                </button>
              )}
              {isExpand && r.output && (
                <pre className="mt-1.5 max-h-48 overflow-auto rounded bg-[#111111] p-2 text-[9px] leading-relaxed text-[#aaaaaa]">
                  {r.output}
                </pre>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LiveCommandTimeline({ commands }: { commands: LiveCommand[] }) {
  const [expanded, setExpanded] = useState(false)
  const isStreaming = commands.some((c) => !c.done)

  return (
    <div className="mt-2">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 text-[#666666] hover:text-[#888888] transition-colors"
      >
        <div
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            isStreaming ? "bg-[#555555] animate-pulse" : "bg-[#3d3d3d]",
          )}
        />
        <span className="text-[11px] font-semibold">Planning</span>
        <span className="text-[9px] text-[#444444]">
          {commands.length} action{commands.length !== 1 ? "s" : ""}
        </span>
        <ChevronRight
          className={cn("h-2.5 w-2.5 transition-transform", expanded && "rotate-90")}
        />
      </button>

      {expanded && (
        <div className="ml-4 mt-1.5 flex flex-col">
          {commands.map((cmd, i) => {
            const isLast = i === commands.length - 1
            const isActive = !cmd.done && isLast
            return (
              <div key={i} className="flex gap-3">
                <div className="flex w-2 shrink-0 flex-col items-center">
                  <div
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      isActive ? "bg-[#555555] animate-pulse" : "bg-[#2d2d2d]",
                    )}
                  />
                  {!isLast && <div className="w-px flex-1 bg-[#232323]" />}
                </div>
                <div className={cn("flex-1 min-w-0", !isLast && "mb-3")}>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-[11px] font-semibold text-[#555555]">
                      {CMD_LABEL[cmd.tag] ?? cmd.tag}
                    </span>
                    {cmd.label && (
                      <span className="truncate font-mono text-[10px] text-[#3d3d3d]">
                        {cmd.label}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AddModelModal({ onClose, onOllamaAdded, onGroqAdded }: {
  onClose: () => void
  onOllamaAdded: () => void
  onGroqAdded: (m: CustomModel) => void
}) {
  const [tab, setTab] = useState<"ollama" | "groq">("ollama")
  const [ollamaName, setOllamaName] = useState("")
  const [groqName, setGroqName] = useState("")
  const [groqKey, setGroqKey] = useState("")
  const [pullStatus, setPullStatus] = useState<"idle" | "loading" | "error" | "ok">("idle")
  const [pullError, setPullError] = useState("")
  const [pullProgress, setPullProgress] = useState(0)
  const [pullPhase, setPullPhase] = useState("")

  const isPulling = pullStatus === "loading"

  async function pullOllama() {
    if (!ollamaName.trim() || isPulling) return
    setPullStatus("loading")
    setPullProgress(0)
    setPullPhase("Starting…")
    setPullError("")
    try {
      const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: ollamaName.trim() }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
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
            if (parsed.error) throw new Error(parsed.error)
            if (parsed.status) setPullPhase(parsed.status)
            if (parsed.total > 0 && parsed.completed != null) {
              setPullProgress(Math.round((parsed.completed / parsed.total) * 100))
            }
          } catch (e) {
            if (!(e instanceof SyntaxError)) throw e
          }
        }
      }
      setPullStatus("ok")
      onOllamaAdded()
    } catch (e) {
      setPullStatus("error")
      setPullError(String(e))
    }
  }

  async function saveGroq() {
    if (!groqName.trim() || !groqKey.trim()) return
    const m: CustomModel = {
      id: crypto.randomUUID(),
      name: groqName.trim(),
      provider: "groq",
      apiKey: groqKey.trim(),
      enabled: true,
      createdAt: Date.now(),
    }
    await db.customModels.add(m)
    onGroqAdded(m)
    onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40">
      <div className="w-[380px] flex flex-col rounded-lg border border-[#3d3d3d] bg-[#1a1a1a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#2d2d2d] px-4 py-3">
          <span className="text-sm font-semibold text-[#e0e0e0]">Add model</span>
          <button
            onClick={isPulling ? undefined : onClose}
            disabled={isPulling}
            className={cn(
              "transition-colors",
              isPulling ? "cursor-not-allowed text-[#333333]" : "text-[#666666] hover:text-[#cccccc]",
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-[#2d2d2d]">
          {(["ollama", "groq"] as const).map((t) => (
            <button
              key={t}
              onClick={() => !isPulling && setTab(t)}
              disabled={isPulling}
              className={cn(
                "flex-1 py-2.5 text-[11px] font-medium transition-colors",
                tab === t ? "border-b-2 border-[#6666aa] text-[#cccccc]" : "text-[#555555] hover:text-[#888888]",
                isPulling && "cursor-not-allowed opacity-50",
              )}
            >
              {t === "ollama" ? "Ollama" : "Groq"}
            </button>
          ))}
        </div>

        <div className="px-4 py-4 flex flex-col gap-3">
          {tab === "ollama" ? (
            <>
              <p className="text-[10px] text-[#555555]">Model name to pull from Ollama registry</p>
              <input
                autoFocus
                value={ollamaName}
                disabled={isPulling || pullStatus === "ok"}
                onChange={(e) => { setOllamaName(e.target.value); setPullStatus("idle") }}
                onKeyDown={(e) => e.key === "Enter" && pullOllama()}
                placeholder="e.g. llama3.2, qwen2.5:7b"
                className="w-full rounded border border-[#3d3d3d] bg-[#141414] px-2.5 py-1.5 text-[11px] text-[#cccccc] placeholder:text-[#444444] outline-none focus:border-[#555555] transition-colors disabled:opacity-40"
              />

              {/* Progress bar */}
              {isPulling && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-[#555555] truncate max-w-[240px]">{pullPhase}</span>
                    {pullProgress > 0 && (
                      <span className="text-[9px] text-[#555555] shrink-0 ml-2">{pullProgress}%</span>
                    )}
                  </div>
                  <div className="h-[3px] w-full rounded-full bg-[#2d2d2d] overflow-hidden">
                    {pullProgress > 0 ? (
                      <div
                        className="h-full rounded-full bg-[#4a4a6a] transition-all duration-300"
                        style={{ width: `${pullProgress}%` }}
                      />
                    ) : (
                      <div
                        className="h-full w-1/3 rounded-full bg-[#4a4a6a]"
                        style={{ animation: "indeterminate 1.8s ease-in-out infinite" }}
                      />
                    )}
                  </div>
                </div>
              )}

              {pullStatus === "error" && <p className="text-[10px] text-red-400">{pullError}</p>}
              {pullStatus === "ok" && <p className="text-[10px] text-green-400">Pulled successfully</p>}

              <div className="flex justify-end gap-2">
                <button
                  onClick={onClose}
                  disabled={isPulling}
                  className={cn(
                    "px-3 py-1 rounded text-[10px] transition-colors",
                    isPulling
                      ? "cursor-not-allowed text-[#333333]"
                      : "text-[#666666] hover:text-[#cccccc] hover:bg-[#2d2d2d]",
                  )}
                >
                  Cancel
                </button>
                <button
                  onClick={pullOllama}
                  disabled={!ollamaName.trim() || isPulling || pullStatus === "ok"}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded text-[10px] transition-colors",
                    ollamaName.trim() && !isPulling && pullStatus !== "ok"
                      ? "bg-[#2d2d4a] text-[#aaaacc] hover:bg-[#3d3d5a]"
                      : "bg-[#222222] text-[#444444] cursor-not-allowed",
                  )}
                >
                  {isPulling && <Loader2 className="h-3 w-3" style={{ animation: "spin 1s linear infinite" }} />}
                  {isPulling ? "Pulling…" : "Pull"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[10px] text-[#555555]">Groq model name and API key</p>
              <input
                autoFocus
                value={groqName}
                onChange={(e) => setGroqName(e.target.value)}
                placeholder="e.g. llama3-8b-8192"
                className="w-full rounded border border-[#3d3d3d] bg-[#141414] px-2.5 py-1.5 text-[11px] text-[#cccccc] placeholder:text-[#444444] outline-none focus:border-[#555555] transition-colors"
              />
              <input
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="API key (gsk_…)"
                type="password"
                className="w-full rounded border border-[#3d3d3d] bg-[#141414] px-2.5 py-1.5 text-[11px] text-[#cccccc] placeholder:text-[#444444] outline-none focus:border-[#555555] transition-colors"
              />
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="px-3 py-1 rounded text-[10px] text-[#666666] hover:text-[#cccccc] hover:bg-[#2d2d2d] transition-colors">
                  Cancel
                </button>
                <button
                  onClick={saveGroq}
                  disabled={!groqName.trim() || !groqKey.trim()}
                  className={cn(
                    "px-3 py-1 rounded text-[10px] transition-colors",
                    groqName.trim() && groqKey.trim()
                      ? "bg-[#2d2d4a] text-[#aaaacc] hover:bg-[#3d3d5a]"
                      : "bg-[#222222] text-[#444444] cursor-not-allowed",
                  )}
                >
                  Save
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors duration-200",
        enabled ? "bg-[#4a4a6a]" : "bg-[#2d2d2d]",
      )}
      role="switch"
      aria-checked={enabled}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-0.5 h-3 w-3 rounded-full bg-[#cccccc] shadow transition-transform duration-200",
          enabled ? "translate-x-3.5" : "translate-x-0.5",
        )}
      />
    </button>
  )
}


function SettingsModal({
  ollamaModels,
  customModels,
  disabledModels,
  onToggleModel,
  onOllamaRefresh,
  onCustomModelAdded,
  onDeleteCustomModel,
  onClose,
}: {
  ollamaModels: string[]
  customModels: CustomModel[]
  disabledModels: Set<string>
  onToggleModel: (name: string) => void
  onOllamaRefresh: () => void
  onCustomModelAdded: (m: CustomModel) => void
  onDeleteCustomModel: (id: string) => void
  onClose: () => void
}) {
  const [showAddModel, setShowAddModel] = useState(false)

  const allModels = [
    ...ollamaModels.map((m) => ({ id: m, name: m, provider: "ollama" as const })),
    ...customModels.map((m) => ({ id: m.id, name: m.name, provider: m.provider })),
  ]

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
        <div className="w-[420px] max-h-[80vh] flex flex-col rounded-lg border border-[#3d3d3d] bg-[#1a1a1a] shadow-2xl">
          <div className="flex items-center justify-between border-b border-[#2d2d2d] px-4 py-3">
            <span className="text-sm font-semibold text-[#e0e0e0]">Settings</span>
            <button onClick={onClose} className="text-[#666666] hover:text-[#cccccc] transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:bg-[#3d3d3d] [&::-webkit-scrollbar-track]:bg-transparent">
            <div className="flex items-center justify-between border-b border-[#1e1e1e] px-4 py-2">
              <span className="text-[9px] font-semibold uppercase tracking-widest text-[#444444]">Models</span>
            </div>
            {allModels.length === 0 ? (
              <div className="px-4 py-4 text-center text-[11px] text-[#444444]">No models found</div>
            ) : (
              allModels.map((m) => (
                <div key={m.id} className="flex items-center gap-3 border-b border-[#1e1e1e] px-4 py-2.5 hover:bg-[#1e1e1e] transition-colors">
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <p className="truncate font-mono text-[11px] text-[#cccccc]">{m.name}</p>
                    {m.provider === "groq" && (
                      <span className="shrink-0 rounded px-1 py-0.5 text-[8px] font-semibold bg-[#1a1a2e] text-[#6666aa]">GROQ</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Toggle enabled={!disabledModels.has(m.name)} onToggle={() => onToggleModel(m.name)} />
                    {m.provider === "groq" && (
                      <button onClick={() => onDeleteCustomModel(m.id)} className="text-[#444444] hover:text-red-400 transition-colors">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-[#2d2d2d] px-4 py-3">
            <button
              onClick={() => setShowAddModel(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded py-1.5 text-[11px] text-[#666666] hover:bg-[#242424] hover:text-[#aaaaaa] transition-colors"
            >
              <Plus className="h-3 w-3" />
              Add model
            </button>
          </div>
        </div>
      </div>
      {showAddModel && (
        <AddModelModal
          onClose={() => setShowAddModel(false)}
          onOllamaAdded={() => { onOllamaRefresh(); setShowAddModel(false) }}
          onGroqAdded={(m) => { onCustomModelAdded(m); setShowAddModel(false) }}
        />
      )}
    </>,
    document.body,
  )
}

export function AgentChat({ rootPath }: { rootPath?: string }) {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [currentDir, setCurrentDir] = useState<string>("")
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<Conversation[]>([])
  const [showTemplates, setShowTemplates] = useState(false)
  const [customModels, setCustomModels] = useState<CustomModel[]>([])
  const [disabledModels, setDisabledModels] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("axyr-disabled-models")
      return new Set(raw ? JSON.parse(raw) : [])
    } catch { return new Set() }
  })
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const historyRef = useRef<HTMLDivElement>(null)
  const clockBtnRef = useRef<HTMLButtonElement>(null)
  const [historyPos, setHistoryPos] = useState<{ top: number; right: number } | null>(null)

  useEffect(() => {
    if (rootPath) setCurrentDir(rootPath)
  }, [rootPath])

  useEffect(() => {
    if (!showHistory) return
    db.conversations.orderBy("timestamp").reverse().toArray().then(setHistory)

    if (clockBtnRef.current) {
      const rect = clockBtnRef.current.getBoundingClientRect()
      setHistoryPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }

    function handleClick(e: MouseEvent) {
      if (
        historyRef.current && !historyRef.current.contains(e.target as Node) &&
        clockBtnRef.current && !clockBtnRef.current.contains(e.target as Node)
      ) {
        setShowHistory(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [showHistory])

  const hasInput = input.trim().length > 0

  const effectiveModels = [
    ...models.filter((m) => !disabledModels.has(m)),
    ...customModels.filter((m) => !disabledModels.has(m.name)).map((m) => m.name),
  ]

  useEffect(() => {
    if (selectedModel && disabledModels.has(selectedModel)) {
      setSelectedModel(effectiveModels[0] || "")
    }
  }, [disabledModels])

  function loadOllamaModels() {
    fetch(`${OLLAMA_BASE}/api/tags`)
      .then((r) => r.json())
      .then((data) => {
        const names: string[] = (data.models ?? []).map((m: { name: string }) => m.name)
        setModels(names)
        setSelectedModel((prev) => prev || names[0] || "")
      })
      .catch(() => { })
  }

  useEffect(() => {
    loadOllamaModels()
    db.customModels.orderBy("createdAt").toArray().then(setCustomModels)
  }, [])

  function toggleModel(name: string) {
    setDisabledModels((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      localStorage.setItem("axyr-disabled-models", JSON.stringify([...next]))
      return next
    })
  }

  function addCustomModel(m: CustomModel) {
    setCustomModels((prev) => [...prev, m])
  }

  async function deleteCustomModel(id: string) {
    await db.customModels.delete(id)
    setCustomModels((prev) => prev.filter((m) => m.id !== id))
  }

  useEffect(() => {
    if (!selectedModel) return

    const unloadModel = () => {
      abortRef.current?.abort()
      navigator.sendBeacon(
        `${OLLAMA_BASE}/api/chat`,
        JSON.stringify({ model: selectedModel, keep_alive: 0 }),
      )
    }

    window.addEventListener("beforeunload", unloadModel)

    const setupTauriClose = async () => {
      const w = window as unknown as { __TAURI_INTERNALS__?: unknown }
      if (!w.__TAURI_INTERNALS__) return
      const { getCurrentWindow } = await import("@tauri-apps/api/window")
      const win = getCurrentWindow()
      const unlisten = await win.onCloseRequested(async (e) => {
        e.preventDefault()
        abortRef.current?.abort()
        try {
          await fetch(`${OLLAMA_BASE}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: selectedModel, keep_alive: 0 }),
          })
        } catch { }
        await win.destroy()
      })
      return unlisten
    }

    let unlistenTauri: (() => void) | undefined
    setupTauriClose().then((u) => { unlistenTauri = u })

    return () => {
      window.removeEventListener("beforeunload", unloadModel)
      unlistenTauri?.()
    }
  }, [selectedModel])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distFromBottom < 120) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const sendMessage = useCallback(async () => {
    if (!hasInput || isStreaming || !selectedModel) return
    const userContent = input.trim()
    setInput("")

    const userId = crypto.randomUUID()
    const assistantId = crypto.randomUUID()

    const streamStartMs = Date.now()
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: userContent },
      { id: assistantId, role: "assistant", content: "", streamStartMs },
    ])
    setIsStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    const systemContent = SYSTEM_PROMPT.replace(
      "{{ROOT_PATH}}",
      rootPath || "(nenhum projeto aberto)",
    )

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            { role: "system", content: systemContent },
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: userContent },
          ],
          stream: true,
          think: true,
          keep_alive: "2m",
        }),
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let fullResponse = ""
      let fullThinking = ""
      let liveTokenCount = 0
      let messageStats: MessageStats | undefined

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        for (const line of chunk.split("\n")) {
          if (!line.trim()) continue
          try {
            const parsed = JSON.parse(line)
            // Ollama thinking API: message.thinking field (newer versions, think: true)
            const thinkingDelta: string = parsed.message?.thinking ?? ""
            let contentDelta: string = parsed.message?.content ?? ""

            if (thinkingDelta) fullThinking += thinkingDelta

            // Fallback: thinking embedded as <think>...</think> in content
            if (contentDelta && contentDelta.includes("<think>")) {
              const { thinking: embeddedThinking, mainContent: stripped } = extractThinking(fullResponse + contentDelta)
              if (embeddedThinking) fullThinking = embeddedThinking
              contentDelta = stripped.slice(fullResponse.length)
            }

            if (contentDelta) { fullResponse += contentDelta; liveTokenCount++ }
            const thinkingDone = fullThinking.length > 0 && fullResponse.length > 0

            if (thinkingDelta || contentDelta) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? {
                      ...m,
                      content: fullResponse,
                      thinking: fullThinking || undefined,
                      thinkingDone,
                      liveCommands: parseLiveCommands(fullResponse),
                      liveTokens: liveTokenCount,
                    }
                    : m,
                ),
              )
            }
            // Update thinking-only state (no content yet)
            if (thinkingDelta && !contentDelta) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, thinking: fullThinking, thinkingDone: false }
                    : m,
                ),
              )
            }
            if (parsed.done && parsed.eval_count) {
              const evalDurationNs: number = parsed.eval_duration ?? 0
              const totalDurationNs: number = parsed.total_duration ?? 0
              const elapsedMs = Date.now() - streamStartMs
              const effectiveDurationS = evalDurationNs > 0
                ? evalDurationNs / 1_000_000_000
                : elapsedMs / 1000
              messageStats = {
                durationMs: totalDurationNs > 0 ? Math.round(totalDurationNs / 1_000_000) : elapsedMs,
                tokensGenerated: parsed.eval_count,
                tokensPerSec: effectiveDurationS > 0
                  ? Math.round(parsed.eval_count / effectiveDurationS)
                  : 0,
              }
            }
          } catch { }
        }
      }

      const commands = parseCommands(fullResponse)
      if (commands.length > 0) {
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, executing: true } : m)),
        )
        const { results, finalCwd } = await executeCommands(
          commands,
          rootPath || "",
        )
        setCurrentDir(finalCwd)
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, executing: false, commandResults: results, stats: messageStats }
              : m,
          ),
        )
      } else {
        if (messageStats) {
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, stats: messageStats } : m)),
          )
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                ...m,
                content: "Error: could not reach Ollama. Is it running on port 11434?",
              }
              : m,
          ),
        )
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [hasInput, isStreaming, selectedModel, input, messages, rootPath, currentDir])

  function stopStreaming() {
    abortRef.current?.abort()
  }

  async function saveConversation(msgs: Message[]) {
    const userMsg = msgs.find((m) => m.role === "user")
    if (!userMsg) return
    const title = userMsg.content.slice(0, 60) + (userMsg.content.length > 60 ? "…" : "")
    const stored = msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      commandResults: m.commandResults,
    }))
    await db.conversations.add({
      id: crypto.randomUUID(),
      title,
      timestamp: Date.now(),
      rootPath: rootPath || "",
      messages: stored,
    })
  }

  async function newConversation() {
    abortRef.current?.abort()
    if (messages.length > 0) await saveConversation(messages)
    setMessages([])
    setInput("")
    setIsStreaming(false)
    setCurrentDir(rootPath || "")
  }

  async function restoreConversation(conv: Conversation) {
    abortRef.current?.abort()
    if (messages.length > 0) await saveConversation(messages)
    setMessages(
      conv.messages.map((m) => ({
        ...m,
        liveCommands: undefined,
        executing: undefined,
      })),
    )
    setInput("")
    setIsStreaming(false)
    setCurrentDir(conv.rootPath || rootPath || "")
    setShowHistory(false)
  }

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await db.conversations.delete(id)
    setHistory((prev) => prev.filter((c) => c.id !== id))
  }

  return (
    <div className="flex h-full flex-col bg-[#141414] border-l border-[#2d2d2d]">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between border-b border-[#2d2d2d] px-3 py-2">
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
                ref={clockBtnRef}
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[#888888] hover:bg-[#2d2d2d] hover:text-[#e0e0e0]"
                onClick={() => setShowHistory((v) => !v)}
              >
                <Clock className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">History</TooltipContent>
          </Tooltip>

          {showHistory && historyPos && typeof document !== "undefined" && createPortal(
            <div
              ref={historyRef}
              style={{ position: "fixed", top: historyPos.top, right: historyPos.right, zIndex: 9999 }}
              className="w-72 rounded-md border border-[#3d3d3d] bg-[#1a1a1a] shadow-xl"
            >
              <div className="border-b border-[#2d2d2d] px-3 py-2">
                <span className="text-[10px] font-semibold text-[#666666] uppercase tracking-wider">
                  Past conversations
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-thumb]:bg-[#3d3d3d] [&::-webkit-scrollbar-track]:bg-transparent">
                {history.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[10px] text-[#444444]">
                    No saved conversations yet
                  </div>
                ) : (
                  history.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => restoreConversation(conv)}
                      className="group flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-[#242424] transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-[11px] text-[#cccccc]">{conv.title}</p>
                        <p className="text-[9px] text-[#444444] mt-0.5">
                          {new Date(conv.timestamp).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {conv.rootPath && (
                            <span className="ml-1.5 text-[#333333]">
                              · {conv.rootPath.split("/").at(-1)}
                            </span>
                          )}
                        </p>
                      </div>
                      <div
                        role="button"
                        onClick={(e) => deleteConversation(conv.id, e)}
                        className="mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 text-[#444444] hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Trash2 className="h-3 w-3" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-[#888888] hover:bg-[#2d2d2d] hover:text-[#e0e0e0]"
                onClick={() => setShowTemplates(true)}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Templates</TooltipContent>
          </Tooltip>

          {showTemplates && typeof document !== "undefined" && (
            <SettingsModal
              ollamaModels={models}
              customModels={customModels}
              disabledModels={disabledModels}
              onToggleModel={toggleModel}
              onOllamaRefresh={loadOllamaModels}
              onCustomModelAdded={addCustomModel}
              onDeleteCustomModel={deleteCustomModel}
              onClose={() => setShowTemplates(false)}
            />
          )}

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

      {/* Progress bar */}
      <div className="h-[2px] overflow-hidden bg-[#1a1a1a]">
        {isStreaming && (
          <div
            className="h-full w-1/3 bg-[#444455]"
            style={{ animation: "indeterminate 1.8s ease-in-out infinite" }}
          />
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
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
                    {msg.content || msg.thinking ? (
                      <>
                        {/* Thinking block */}
                        {msg.thinking && (
                          <ThinkingBlock thinking={msg.thinking} done={!!msg.thinkingDone} />
                        )}
                        {/* Text: strip command blocks, keep everything else */}
                        {(() => {
                          const text = stripCommandBlocks(msg.content)
                          return text ? <MarkdownContent content={text} /> : null
                        })()}
                        {/* Live preview during streaming (replaced by real timeline after execution) */}
                        {!msg.commandResults && msg.liveCommands && msg.liveCommands.length > 0 && (
                          <LiveCommandTimeline commands={msg.liveCommands} />
                        )}
                        {/* Executing indicator */}
                        {msg.executing && (
                          <div className="mt-2 flex items-center gap-1.5 text-[#555555]">
                            <Loader2 className="h-3 w-3" style={{ animation: "spin 1s linear infinite" }} />
                            <span className="text-[10px]">Executing…</span>
                          </div>
                        )}
                        {/* Final command timeline */}
                        {msg.commandResults && msg.commandResults.length > 0 && (
                          <CommandTimeline results={msg.commandResults} />
                        )}
                        {/* Stats — live during stream, static after done */}
                        {!msg.stats && msg.streamStartMs && (
                          <LiveStats startMs={msg.streamStartMs} tokens={msg.liveTokens ?? 0} />
                        )}
                        {msg.stats && (
                          <div className="mt-2 flex items-center gap-1.5 text-[9px] text-[#333344]">
                            <span>{formatDuration(msg.stats.durationMs)}</span>
                            <span>·</span>
                            <span>{msg.stats.tokensGenerated} tokens</span>
                            {msg.stats.tokensPerSec > 0 && (
                              <>
                                <span>·</span>
                                <span>{msg.stats.tokensPerSec} tok/s</span>
                              </>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="flex items-center gap-1 text-[#555555] px-1 py-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
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
                    {selectedModel ||
                      (effectiveModels.length === 0 ? "no models" : "select model")}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </button>

                {showModelMenu && effectiveModels.length > 0 && (
                  <div className="absolute bottom-full left-0 mb-1 w-52 rounded-md border border-[#3d3d3d] bg-[#1e1e1e] py-1 shadow-xl z-50">
                    {effectiveModels.map((m) => (
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
                    className="h-6 w-6 rounded-md bg-[#3d3d3d] text-[#cccccc] hover:bg-red-900/40 hover:text-red-400 transition-colors"
                  >
                    <Square className="size-2 fill-current" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">Stop</TooltipContent>
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
