"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import type * as Monaco from "monaco-editor"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#1e1e1e]">
      <span className="text-sm text-[#888888]">Loading editor…</span>
    </div>
  ),
})


export function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript",
    js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
    json: "json", jsonc: "json",
    css: "css", scss: "scss", less: "less",
    html: "html", htm: "html",
    md: "markdown", mdx: "markdown",
    py: "python", rs: "rust", go: "go",
    sh: "shell", bash: "shell",
    yaml: "yaml", yml: "yaml",
    toml: "ini", xml: "xml", svg: "xml",
  }
  return map[ext] ?? "plaintext"
}

export type OpenFile = { path: string; content: string }

export type EditorStatus = {
  line: number
  col: number
  totalLines: number
  totalChars: number
  language: string
}

export function IDEMonacoEditor({
  file,
  onChange,
  onSave,
  onStatusChange,
}: {
  file?: OpenFile
  onChange?: (content: string) => void
  onSave?: (content: string) => void
  onStatusChange?: (status: EditorStatus) => void
}) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<typeof Monaco | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const onSaveRef = useRef(onSave)
  const onChangeRef = useRef(onChange)
  const onStatusRef = useRef(onStatusChange)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { onSaveRef.current = onSave }, [onSave])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => { onStatusRef.current = onStatusChange }, [onStatusChange])

  useEffect(() => {
    if (!file || !editorRef.current || !monacoRef.current) return
    const editor = editorRef.current
    const monaco = monacoRef.current
    const uri = monaco.Uri.file(file.path)
    const language = getLanguage(file.path.split("/").pop() ?? "")

    let model = monaco.editor.getModel(uri)
    if (!model) {
      model = monaco.editor.createModel(file.content, language, uri)
    }

    const old = editor.getModel()
    if (old !== model) editor.setModel(model)
  }, [file?.path, file?.content, mounted])

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => editorRef.current?.layout())
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  function handleEditorDidMount(
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) {
    editorRef.current = editor
    monacoRef.current = monaco
    setMounted(true)

    monaco.editor.defineTheme("axyr-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#1e1e1e",
        "editor.lineHighlightBackground": "#2a2d2e",
        "editorLineNumber.foreground": "#495057",
        "editorLineNumber.activeForeground": "#cccccc",
      },
    })
    monaco.editor.setTheme("axyr-dark")

    const emitStatus = () => {
      const model = editor.getModel()
      const pos = editor.getPosition()
      if (!model || !pos) return
      const content = model.getValue()
      const lang = model.getLanguageId()
      onStatusRef.current?.({
        line: pos.lineNumber,
        col: pos.column,
        totalLines: model.getLineCount(),
        totalChars: content.length,
        language: lang,
      })
    }

    editor.onDidChangeCursorPosition(emitStatus)
    editor.onDidChangeModelContent(() => {
      const content = editor.getValue()
      onChangeRef.current?.(content)
      emitStatus()
    })
    editor.onDidChangeModel(emitStatus)

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const content = editor.getValue()
      onSaveRef.current?.(content)
    })

    editor.updateOptions({
      fontSize: 13,
      fontFamily: "var(--font-mono), 'JetBrains Mono', 'Fira Code', Menlo, monospace",
      lineHeight: 22,
      minimap: { enabled: true, scale: 1 },
      scrollBeyondLastLine: false,
      wordWrap: "on",
      renderWhitespace: "selection",
      cursorBlinking: "smooth",
      smoothScrolling: true,
      padding: { top: 16, bottom: 16 },
    })
  }

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden bg-[#1e1e1e]">
      <MonacoEditor
        height="100%"
        defaultLanguage="plaintext"
        defaultValue=""
        theme="vs-dark"
        options={{
          fontSize: 13,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          padding: { top: 16, bottom: 16 },
        }}
        onMount={handleEditorDidMount}
      />
    </div>
  )
}
