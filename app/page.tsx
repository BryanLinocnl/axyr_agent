"use client"

import { useCallback, useRef, useState } from "react"

import { AgentChat } from "@/components/agent-chat"
import { EditorTabs, type EditorTab } from "@/components/editor-tabs"
import { FileExplorer } from "@/components/file-explorer"
import { IDEMonacoEditor } from "@/components/monaco-editor"

const INITIAL_TABS: EditorTab[] = [
  {
    id: "1",
    filename: "HelloWorld.tsx",
    path: ["src", "components", "HelloWorld.tsx"],
  },
]

export default function Page() {
  const [chatWidth, setChatWidth] = useState(320)
  const [tabs, setTabs] = useState<EditorTab[]>(INITIAL_TABS)
  const [activeTabId, setActiveTabId] = useState("1")

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

  const closeTab = (id: string) => {
    const next = tabs.filter((t) => t.id !== id)
    setTabs(next)
    if (activeTabId === id && next.length > 0) {
      setActiveTabId(next[next.length - 1].id)
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d0d0d]">
      {/* Left panel — File Explorer */}
      <aside
        className="flex shrink-0 flex-col overflow-hidden border-r border-[#2d2d2d]"
        style={{ width: 240 }}
      >
        <FileExplorer />
      </aside>

      {/* Center panel — Monaco Editor */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {tabs.length > 0 ? (
          <>
            <EditorTabs
              tabs={tabs}
              activeId={activeTabId}
              onSelect={setActiveTabId}
              onClose={closeTab}
            />
            <div className="flex-1 overflow-hidden">
              <IDEMonacoEditor />
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-[#555555]">
            No file open
          </div>
        )}
        <div className="flex items-center gap-4 border-t border-[#2d2d2d] bg-[#007acc] px-3 py-0.5 text-[10px] text-white">
          <span>TypeScript</span>
          <span>UTF-8</span>
          <span className="ml-auto">Ln 1, Col 1</span>
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
        <AgentChat />
      </aside>
    </div>
  )
}
