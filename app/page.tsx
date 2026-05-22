"use client"

import { useCallback, useRef, useState } from "react"

import { ActivityBar } from "@/components/activity-bar"
import { AgentChat } from "@/components/agent-chat"
import { EditorTabs, type EditorTab } from "@/components/editor-tabs"
import { FileExplorer } from "@/components/file-explorer"
import { IDEMonacoEditor, type OpenFile, type EditorStatus } from "@/components/monaco-editor"

export default function Page() {
  const [chatWidth, setChatWidth] = useState(320)
  const [rootPath, setRootPath] = useState<string>("")
  const [explorerRefresh, setExplorerRefresh] = useState(0)
  const [tabs, setTabs] = useState<EditorTab[]>([])
  const [activeTabId, setActiveTabId] = useState("")
  const [openFile, setOpenFile] = useState<OpenFile | undefined>(undefined)
  const [editorStatus, setEditorStatus] = useState<EditorStatus>({
    line: 1, col: 1, totalLines: 0, totalChars: 0, language: "",
  })
  const openFileRef = useRef<OpenFile | undefined>(undefined)
  const fileCacheRef = useRef<Map<string, string>>(new Map())

  const handleFileOpen = useCallback((file: OpenFile) => {
    const filename = file.path.split("/").pop() ?? file.path
    fileCacheRef.current.set(file.path, file.content)
    openFileRef.current = file
    setOpenFile(file)
    setTabs((prev) => {
      const exists = prev.find((t) => t.id === file.path)
      if (exists) {
        setActiveTabId(file.path)
        return prev
      }
      const newTab: EditorTab = {
        id: file.path,
        filename,
        path: file.path.split("/"),
      }
      setActiveTabId(file.path)
      return [...prev, newTab]
    })
  }, [])

  const handleChange = useCallback((content: string) => {
    const path = openFileRef.current?.path
    if (!path) return
    setTabs((prev) =>
      prev.map((t) => (t.id === path ? { ...t, modified: true } : t)),
    )
  }, [])

  const handleSave = useCallback(async (content: string) => {
    const path = openFileRef.current?.path
    if (!path) return
    const w = window as unknown as { __TAURI_INTERNALS__?: unknown }
    if (!w.__TAURI_INTERNALS__) return
    try {
      const { writeTextFile } = await import("@tauri-apps/plugin-fs")
      await writeTextFile(path, content)
      setTabs((prev) =>
        prev.map((t) => (t.id === path ? { ...t, modified: false } : t)),
      )
    } catch (e) {
      console.error("save failed:", e)
    }
  }, [])

  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(0)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true
      startX.current = e.clientX
      startWidth.current = chatWidth

      const onMouseMove = (e: MouseEvent) => {
        if (!dragging.current) return
        const delta = startX.current - e.clientX
        const next = Math.min(700, Math.max(200, startWidth.current + delta))
        setChatWidth(next)
      }

      const onMouseUp = () => {
        dragging.current = false
        window.removeEventListener("mousemove", onMouseMove)
        window.removeEventListener("mouseup", onMouseUp)
      }

      window.addEventListener("mousemove", onMouseMove)
      window.addEventListener("mouseup", onMouseUp)
    },
    [chatWidth],
  )

  const selectTab = useCallback((id: string) => {
    setActiveTabId(id)
    const cached = fileCacheRef.current.get(id)
    if (cached !== undefined) {
      const file = { path: id, content: cached }
      openFileRef.current = file
      setOpenFile(file)
    }
  }, [])

  const closeTab = (id: string) => {
    const next = tabs.filter((t) => t.id !== id)
    setTabs(next)
    if (activeTabId === id && next.length > 0) {
      selectTab(next[next.length - 1].id)
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d0d]">
      {/* Activity Bar */}
      <ActivityBar />

      {/* Left panel — File Explorer */}
      <aside
        className="flex shrink-0 flex-col overflow-hidden border-r border-[#2d2d2d]"
        style={{ width: 240 }}
      >
        <FileExplorer onFileOpen={handleFileOpen} onRootPathChange={setRootPath} refreshTrigger={explorerRefresh} />
      </aside>

      {/* Center panel — Monaco Editor */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {tabs.length > 0 ? (
          <>
            <EditorTabs
              tabs={tabs}
              activeId={activeTabId}
              onSelect={selectTab}
              onClose={closeTab}
            />
            <div className="flex-1 overflow-hidden">
              <IDEMonacoEditor
                file={openFile}
                onChange={handleChange}
                onSave={handleSave}
                onStatusChange={setEditorStatus}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-[#555555]">
            No file open
          </div>
        )}
        <div className="flex items-center gap-4 border-t border-[#2d2d2d] bg-[#007acc] px-3 py-0.5 text-[10px] text-white">
          {editorStatus.language && (
            <span className="capitalize">{editorStatus.language}</span>
          )}
          <span>UTF-8</span>
          {editorStatus.totalLines > 0 && (
            <span>{editorStatus.totalLines} lines</span>
          )}
          {editorStatus.totalChars > 0 && (
            <span>{editorStatus.totalChars.toLocaleString()} chars</span>
          )}
          <span className="ml-auto">
            Ln {editorStatus.line}, Col {editorStatus.col}
          </span>
        </div>
      </main>

      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        className="w-1 shrink-0 cursor-col-resize bg-[#2d2d2d] transition-colors hover:bg-[#007acc] active:bg-[#007acc]"
      />

      {/* Right panel — Agent Chat */}
      <aside
        className="flex shrink-0 flex-col overflow-hidden"
        style={{ width: chatWidth }}
      >
        <AgentChat rootPath={rootPath} onCommandsExecuted={() => setExplorerRefresh((n) => n + 1)} />
      </aside>
    </div>
  )
}
