"use client"

import { useState } from "react"
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode2,
  FileJson,
  FileText,
  File,
  MoreHorizontal,
  FileType2,
  Coffee,
  Braces,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

type FileNode = {
  name: string
  type: "file" | "folder"
  children?: FileNode[]
}

const PROJECT_TREE: FileNode[] = [
  {
    name: "src",
    type: "folder",
    children: [
      {
        name: "app",
        type: "folder",
        children: [
          { name: "layout.tsx", type: "file" },
          { name: "page.tsx", type: "file" },
          { name: "globals.css", type: "file" },
        ],
      },
      {
        name: "components",
        type: "folder",
        children: [
          { name: "agent-chat.tsx", type: "file" },
          { name: "file-explorer.tsx", type: "file" },
          { name: "monaco-editor.tsx", type: "file" },
          {
            name: "ui",
            type: "folder",
            children: [
              { name: "button.tsx", type: "file" },
              { name: "scroll-area.tsx", type: "file" },
              { name: "tooltip.tsx", type: "file" },
            ],
          },
        ],
      },
      {
        name: "lib",
        type: "folder",
        children: [{ name: "utils.ts", type: "file" }],
      },
      {
        name: "hooks",
        type: "folder",
        children: [{ name: "use-mobile.ts", type: "file" }],
      },
    ],
  },
  { name: "package.json", type: "file" },
  { name: "tsconfig.json", type: "file" },
  { name: "next.config.mjs", type: "file" },
  { name: ".gitignore", type: "file" },
]

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "tsx":
      return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
    case "ts":
      return <FileType2 className="h-3.5 w-3.5 shrink-0 text-blue-500" />
    case "jsx":
      return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
    case "js":
      return <Coffee className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
    case "json":
      return <FileJson className="h-3.5 w-3.5 shrink-0 text-yellow-300" />
    case "css":
    case "scss":
      return <Braces className="h-3.5 w-3.5 shrink-0 text-pink-400" />
    case "md":
      return <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
    case "mjs":
    case "cjs":
      return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-green-400" />
    default:
      return <File className="h-3.5 w-3.5 shrink-0 text-gray-500" />
  }
}

function TreeNode({
  node,
  depth = 0,
}: {
  node: FileNode
  depth?: number
}) {
  const [open, setOpen] = useState(depth < 2)

  if (node.type === "folder") {
    return (
      <div>
        <button
          className={cn(
            "flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs text-[#cccccc] hover:bg-[#2a2d2e] transition-colors",
          )}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            <ChevronDown className="h-3 w-3 shrink-0 text-[#cccccc]" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0 text-[#cccccc]" />
          )}
          {open ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" />
          ) : (
            <Folder className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {open && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode key={child.name} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-[#cccccc] hover:bg-[#2a2d2e] transition-colors",
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </button>
  )
}

export function FileExplorer() {
  const [rootOpen, setRootOpen] = useState(true)

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
          Explorer
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-[#cccccc] hover:bg-[#2a2d2e] hover:text-white"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-1 pb-4">
          {/* Project Root */}
          <button
            className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-semibold text-[#cccccc] hover:bg-[#2a2d2e] transition-colors uppercase tracking-wide"
            onClick={() => setRootOpen((v) => !v)}
          >
            {rootOpen ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate text-[11px]">AXYR AGENT</span>
          </button>

          {rootOpen &&
            PROJECT_TREE.map((node) => (
              <TreeNode key={node.name} node={node} depth={1} />
            ))}
        </div>
      </ScrollArea>
    </div>
  )
}
