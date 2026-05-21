"use client"

import { useState, useCallback, useRef, useEffect } from "react"
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
  Braces,
  FolderPlus,
  FilePlus,
  Loader2,
  Copy,
  Trash2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { OpenFile } from "@/components/monaco-editor"

type FileNode = {
  name: string
  path: string
  type: "file" | "folder"
  children?: FileNode[]
}

type PendingCreate = { type: "file" | "folder"; parentPath: string } | null

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase()
  switch (ext) {
    case "tsx":
      return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-blue-400" />
    case "ts":
      return <FileType2 className="h-3.5 w-3.5 shrink-0 text-blue-500" />
    case "jsx":
    case "js":
    case "mjs":
    case "cjs":
      return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-yellow-400" />
    case "json":
      return <FileJson className="h-3.5 w-3.5 shrink-0 text-yellow-300" />
    case "css":
    case "scss":
      return <Braces className="h-3.5 w-3.5 shrink-0 text-pink-400" />
    case "md":
      return <FileText className="h-3.5 w-3.5 shrink-0 text-gray-400" />
    default:
      return <File className="h-3.5 w-3.5 shrink-0 text-gray-500" />
  }
}

function NewItemInput({
  type,
  depth,
  onConfirm,
  onCancel,
}: {
  type: "file" | "folder"
  depth: number
  onConfirm: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && value.trim()) onConfirm(value.trim())
    else if (e.key === "Escape") onCancel()
  }

  return (
    <div
      className="flex items-center gap-1.5 rounded bg-[#2a2d2e] py-0.5 pr-1"
      style={{ paddingLeft: `${depth * 12 + 4}px` }}
    >
      {type === "folder" ? (
        <Folder className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" />
      ) : (
        <File className="h-3.5 w-3.5 shrink-0 text-gray-400" />
      )}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCancel}
        className="flex-1 rounded-sm bg-[#3c3f41] px-1 py-0 text-xs text-[#cccccc] outline outline-1 outline-[#007acc]"
        placeholder={type === "folder" ? "nome da pasta" : "nome do arquivo"}
      />
    </div>
  )
}

function TreeNode({
  node,
  depth,
  selectedPath,
  pendingCreate,
  onSelect,
  onFileOpen,
  onDuplicate,
  onDelete,
  onCreateConfirm,
  onCreateCancel,
}: {
  node: FileNode
  depth: number
  selectedPath: string | null
  pendingCreate: PendingCreate
  onSelect: (path: string, type: "file" | "folder") => void
  onFileOpen: (path: string) => void
  onDuplicate: (node: FileNode) => void
  onDelete: (node: FileNode) => void
  onCreateConfirm: (name: string) => void
  onCreateCancel: () => void
}) {
  const isSelected = selectedPath === node.path
  const [open, setOpen] = useState(depth < 1)

  if (node.type === "folder") {
    const hasPending = pendingCreate?.parentPath === node.path

    return (
      <div className="group/row">
        <div
          className={cn(
            "group/item relative flex w-full items-center rounded text-xs text-[#cccccc] hover:bg-[#2a2d2e] transition-colors",
            isSelected && "bg-[#37373d]",
          )}
          style={{ paddingLeft: `${depth * 12 + 4}px` }}
        >
          <button
            className="flex flex-1 items-center gap-1 py-0.5 text-left"
            onClick={() => { setOpen((v) => !v); onSelect(node.path, "folder") }}
          >
            {open ? <ChevronDown className="h-3 w-3 shrink-0" /> : <ChevronRight className="h-3 w-3 shrink-0" />}
            {open
              ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" />
              : <Folder className="h-3.5 w-3.5 shrink-0 text-[#dcb67a]" />}
            <span className="truncate">{node.name}</span>
          </button>
          <div className="mr-1 hidden items-center gap-0.5 group-hover/item:flex">
            <button
              onClick={(e) => { e.stopPropagation(); onDuplicate(node) }}
              className="h-4 w-4 flex items-center justify-center rounded text-[#666666] hover:text-[#cccccc]"
              title="Duplicar"
            >
              <Copy className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node) }}
              className="h-4 w-4 flex items-center justify-center rounded text-[#666666] hover:text-red-400"
              title="Excluir"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        {open && (
          <div>
            {hasPending && (
              <NewItemInput
                type={pendingCreate!.type}
                depth={depth + 1}
                onConfirm={onCreateConfirm}
                onCancel={onCreateCancel}
              />
            )}
            {node.children?.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                selectedPath={selectedPath}
                pendingCreate={pendingCreate}
                onSelect={onSelect}
                onFileOpen={onFileOpen}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
                onCreateConfirm={onCreateConfirm}
                onCreateCancel={onCreateCancel}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={cn(
        "group/item relative flex w-full items-center rounded text-xs text-[#cccccc] hover:bg-[#2a2d2e] transition-colors",
        isSelected && "bg-[#37373d]",
      )}
      style={{ paddingLeft: `${depth * 12 + 20}px` }}
    >
      <button
        className="flex flex-1 items-center gap-1.5 py-0.5 text-left"
        onClick={() => { onSelect(node.path, "file"); onFileOpen(node.path) }}
      >
        {getFileIcon(node.name)}
        <span className="truncate">{node.name}</span>
      </button>
      <div className="mr-1 hidden items-center gap-0.5 group-hover/item:flex">
        <button
          onClick={(e) => { e.stopPropagation(); onDuplicate(node) }}
          className="h-4 w-4 flex items-center justify-center rounded text-[#666666] hover:text-[#cccccc]"
          title="Duplicar"
        >
          <Copy className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(node) }}
          className="h-4 w-4 flex items-center justify-center rounded text-[#666666] hover:text-red-400"
          title="Excluir"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

async function readDirRecursive(dirPath: string): Promise<FileNode[]> {
  const { readDir } = await import("@tauri-apps/plugin-fs")
  const entries = await readDir(dirPath)
  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (!entry.name || entry.name.startsWith(".")) continue
    const entryPath = `${dirPath}/${entry.name}`
    if (entry.isDirectory) {
      const children = await readDirRecursive(entryPath)
      nodes.push({ name: entry.name, path: entryPath, type: "folder", children })
    } else {
      nodes.push({ name: entry.name, path: entryPath, type: "file" })
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function FileExplorer({
  onFileOpen,
  onRootPathChange,
}: {
  onFileOpen?: (file: OpenFile) => void
  onRootPathChange?: (path: string) => void
}) {
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [rootName, setRootName] = useState<string>("")
  const [tree, setTree] = useState<FileNode[]>([])
  const [rootOpen, setRootOpen] = useState(true)
  const [loading, setLoading] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [pendingCreate, setPendingCreate] = useState<PendingCreate>(null)

  useEffect(() => {
    if (rootPath) onRootPathChange?.(rootPath)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath])

  const refreshTree = useCallback(async (path: string) => {
    const nodes = await readDirRecursive(path)
    setTree(nodes)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem("axyr:rootPath")
    if (!saved) return
    const w = window as unknown as { __TAURI_INTERNALS__?: unknown }
    if (!w.__TAURI_INTERNALS__) return
    setLoading(true)
    readDirRecursive(saved)
      .then((nodes) => {
        setRootPath(saved)
        setRootName(saved.split("/").pop() ?? saved)
        setTree(nodes)
      })
      .catch(() => localStorage.removeItem("axyr:rootPath"))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!rootPath) return
    let unwatch: (() => void) | null = null

    import("@tauri-apps/plugin-fs").then(({ watch }) => {
      watch(
        rootPath,
        () => { refreshTree(rootPath) },
        { recursive: true },
      ).then((fn) => { unwatch = fn })
    })

    return () => { unwatch?.() }
  }, [rootPath, refreshTree])

  const chooseDirectory = useCallback(async () => {
    const w = window as unknown as { __TAURI_INTERNALS__?: unknown }
    if (!w.__TAURI_INTERNALS__) {
      alert("Rode o app com: bun run tauri:dev")
      return
    }
    setLoading(true)
    try {
      const { open } = await import("@tauri-apps/plugin-dialog")
      const selected = await open({ directory: true, multiple: false })
      if (!selected || typeof selected !== "string") return
      const name = selected.split("/").pop() ?? selected
      const nodes = await readDirRecursive(selected)
      localStorage.setItem("axyr:rootPath", selected)
      setRootPath(selected)
      setRootName(name)
      setTree(nodes)
    } catch (e) {
      console.error("chooseDirectory failed:", e)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleFileOpen = useCallback(async (filePath: string) => {
    const w = window as unknown as { __TAURI_INTERNALS__?: unknown }
    if (!w.__TAURI_INTERNALS__ || !onFileOpen) return
    try {
      const { readTextFile } = await import("@tauri-apps/plugin-fs")
      const content = await readTextFile(filePath)
      onFileOpen({ path: filePath, content })
    } catch (e) {
      console.error("readTextFile failed:", e)
    }
  }, [onFileOpen])

  const handleSelect = useCallback((path: string, type: "file" | "folder") => {
    setSelectedPath(path)
    if (type === "folder") {
      setPendingCreate(null)
    }
  }, [])

  const getCreateParent = useCallback(() => {
    if (!rootPath) return rootPath
    if (!selectedPath) return rootPath
    const node = findNode(tree, selectedPath)
    if (!node) return rootPath
    if (node.type === "folder") return selectedPath
    return selectedPath.substring(0, selectedPath.lastIndexOf("/"))
  }, [rootPath, selectedPath, tree])

  const handleCreate = useCallback(async (name: string) => {
    if (!pendingCreate) return
    const { mkdir, writeFile } = await import("@tauri-apps/plugin-fs")
    const newPath = `${pendingCreate.parentPath}/${name}`
    try {
      if (pendingCreate.type === "folder") {
        await mkdir(newPath, { recursive: true })
      } else {
        await writeFile(newPath, new Uint8Array())
      }
      if (rootPath) await refreshTree(rootPath)
    } catch (e) {
      console.error("create failed:", e)
    } finally {
      setPendingCreate(null)
    }
  }, [rootPath, pendingCreate, refreshTree])

  const handleDuplicate = useCallback(async (node: FileNode) => {
    if (!rootPath) return
    const { copyFile, mkdir, readDir } = await import("@tauri-apps/plugin-fs")
    const parent = node.path.substring(0, node.path.lastIndexOf("/"))
    const ext = node.name.includes(".") ? `.${node.name.split(".").pop()}` : ""
    const base = node.name.includes(".") ? node.name.slice(0, node.name.lastIndexOf(".")) : node.name
    const copyPath = `${parent}/${base} copy${ext}`
    try {
      if (node.type === "file") {
        await copyFile(node.path, copyPath)
      } else {
        await mkdir(copyPath, { recursive: true })
        const entries = await readDir(node.path)
        for (const e of entries) {
          if (e.name && !e.name.startsWith(".") && e.isFile) {
            await copyFile(`${node.path}/${e.name}`, `${copyPath}/${e.name}`)
          }
        }
      }
      await refreshTree(rootPath)
    } catch (e) {
      console.error("duplicate failed:", e)
    }
  }, [rootPath, refreshTree])

  const handleDelete = useCallback(async (node: FileNode) => {
    if (!rootPath) return
    const { remove } = await import("@tauri-apps/plugin-fs")
    try {
      await remove(node.path, { recursive: true })
      await refreshTree(rootPath)
    } catch (e) {
      console.error("delete failed:", e)
    }
  }, [rootPath, refreshTree])

  const startCreate = (type: "file" | "folder") => {
    const parent = getCreateParent()
    if (!parent) return
    setRootOpen(true)
    setPendingCreate({ type, parentPath: parent })
  }

  const rootHasPending = pendingCreate?.parentPath === rootPath

  return (
    <div className="flex h-full flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-[#bbbbbb]">
          Explorer
        </span>
        {rootPath && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              title="Nova pasta"
              onClick={() => startCreate("folder")}
              className="h-5 w-5 text-[#888888] hover:bg-[#2a2d2e] hover:text-[#cccccc]"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Novo arquivo"
              onClick={() => startCreate("file")}
              className="h-5 w-5 text-[#888888] hover:bg-[#2a2d2e] hover:text-[#cccccc]"
            >
              <FilePlus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-[#888888] hover:bg-[#2a2d2e] hover:text-[#cccccc]"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {!rootPath ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-xs leading-relaxed text-[#888888]">
            Antes de começar o projeto, escolha o diretório principal.
          </p>
          <button
            onClick={chooseDirectory}
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-[#3d3d3d] bg-[#2d2d2d] px-3 py-2 text-xs text-[#cccccc] transition-colors hover:border-[#555555] hover:bg-[#3d3d3d] disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4" style={{ animation: "spin 1s linear infinite" }} />
            ) : (
              <FolderOpen className="h-4 w-4 text-[#dcb67a]" />
            )}
            <span>Escolher diretório</span>
          </button>
        </div>
      ) : (
        <div
          className="flex-1 overflow-y-auto px-1 pb-4
            [&::-webkit-scrollbar]:w-[4px]
            [&::-webkit-scrollbar-track]:bg-transparent
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb]:bg-[#3d3d3d]"
        >
          <button
            className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-xs font-semibold uppercase tracking-wide text-[#cccccc] hover:bg-[#2a2d2e] transition-colors"
            onClick={() => setRootOpen((v) => !v)}
          >
            {rootOpen ? (
              <ChevronDown className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0" />
            )}
            <span className="truncate text-[11px]">{rootName.toUpperCase()}</span>
          </button>

          {rootOpen && (
            <>
              {rootHasPending && (
                <NewItemInput
                  type={pendingCreate!.type}
                  depth={1}
                  onConfirm={handleCreate}
                  onCancel={() => setPendingCreate(null)}
                />
              )}
              {tree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={1}
                  selectedPath={selectedPath}
                  pendingCreate={pendingCreate}
                  onSelect={handleSelect}
                  onFileOpen={handleFileOpen}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                  onCreateConfirm={handleCreate}
                  onCreateCancel={() => setPendingCreate(null)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function findNode(nodes: FileNode[], path: string): FileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n
    if (n.children) {
      const found = findNode(n.children, path)
      if (found) return found
    }
  }
  return null
}
