"use client"

import {
  Braces,
  ChevronRight,
  File,
  FileCode2,
  FileJson,
  FileText,
  FileType2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type EditorTab = {
  id: string
  filename: string
  path: string[]
  modified?: boolean
}

type Props = {
  tabs: EditorTab[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

function FileIcon({
  filename,
  size = 12,
}: {
  filename: string
  size?: number
}) {
  const ext = filename.split(".").pop()?.toLowerCase()
  const cls = `shrink-0`
  if (ext === "tsx" || ext === "jsx")
    return <FileCode2 size={size} className={cn(cls, "text-[#61dafb]")} />
  if (ext === "ts" || ext === "js")
    return <FileType2 size={size} className={cn(cls, "text-[#3178c6]")} />
  if (ext === "json")
    return <FileJson size={size} className={cn(cls, "text-[#f1c40f]")} />
  if (ext === "css" || ext === "scss")
    return <Braces size={size} className={cn(cls, "text-[#563d7c]")} />
  if (ext === "md")
    return <FileText size={size} className={cn(cls, "text-[#aaaaaa]")} />
  return <File size={size} className={cn(cls, "text-[#888888]")} />
}

export function EditorTabs({ tabs, activeId, onSelect, onClose }: Props) {
  const activeTab = tabs.find((t) => t.id === activeId)

  return (
    <div className="flex flex-col border-b border-[#2d2d2d]">
      {/* Tab row */}
      <div className="flex items-end overflow-x-auto bg-[#181818] scrollbar-none">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId
          return (
            <button
              key={tab.id}
              onClick={() => onSelect(tab.id)}
              className={cn(
                "group relative flex min-w-0 max-w-[200px] shrink-0 cursor-pointer items-center gap-1.5 border-r border-[#2d2d2d] px-3 py-2 text-xs transition-colors",
                isActive
                  ? "bg-[#1e1e1e] text-[#cccccc]"
                  : "bg-[#2d2d2d] text-[#888888] italic hover:bg-[#252525] hover:text-[#aaaaaa]",
              )}
            >
              {/* Active top border */}
              {isActive && (
                <span className="absolute inset-x-0 top-0 h-[2px] bg-[#007acc]" />
              )}

              <FileIcon filename={tab.filename} size={12} />

              <span className="truncate">
                {tab.modified && (
                  <span className="mr-0.5 text-[#e8d44d]">●</span>
                )}
                {tab.filename}
              </span>

              <span
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
                className={cn(
                  "ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors",
                  isActive
                    ? "text-[#888888] hover:bg-[#3d3d3d] hover:text-[#cccccc]"
                    : "text-transparent group-hover:text-[#888888] group-hover:hover:bg-[#3d3d3d] group-hover:hover:text-[#cccccc]",
                )}
              >
                <X size={10} />
              </span>
            </button>
          )
        })}
      </div>

      {/* Breadcrumb row */}
      {activeTab && (
        <div className="flex items-center gap-0.5 overflow-x-auto bg-[#1e1e1e] px-3 py-1 scrollbar-none">
          {activeTab.path.map((segment, i) => {
            const isLast = i === activeTab.path.length - 1
            const isFile = isLast && segment.includes(".")
            return (
              <span key={i} className="flex items-center gap-0.5">
                {i > 0 && (
                  <ChevronRight size={11} className="shrink-0 text-[#555555]" />
                )}
                {isFile ? (
                  <span className="flex items-center gap-1">
                    <FileIcon filename={segment} size={11} />
                    <span className="whitespace-nowrap text-[11px] text-[#cccccc]">
                      {segment}
                    </span>
                  </span>
                ) : (
                  <span className="whitespace-nowrap text-[11px] text-[#888888] hover:text-[#cccccc]">
                    {segment}
                  </span>
                )}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
