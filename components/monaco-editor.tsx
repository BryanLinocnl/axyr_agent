"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef } from "react"
import type * as Monaco from "monaco-editor"

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-[#1e1e1e]">
      <span className="text-sm text-[#888888]">Loading editor…</span>
    </div>
  ),
})

const DEFAULT_CODE = `import React from "react"

interface Props {
  name: string
  greeting?: string
}

export default function HelloWorld({ name, greeting = "Hello" }: Props) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 text-white">
      <h1 className="text-4xl font-bold mb-4">
        {greeting}, {name}!
      </h1>
      <p className="text-gray-400 text-lg">
        Welcome to your AXYR Agent IDE.
      </p>
      <p className="text-gray-500 text-sm mt-2">
        Start editing to see your changes in real time.
      </p>
    </div>
  )
}
`

export function IDEMonacoEditor() {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver(() => {
      editorRef.current?.layout()
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  function handleEditorDidMount(
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) {
    editorRef.current = editor

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
        defaultLanguage="typescript"
        defaultValue={DEFAULT_CODE}
        theme="vs-dark"
        options={{
          fontSize: 13,
          minimap: { enabled: true },
          scrollBeyondLastLine: false,
          wordWrap: "on",
          padding: { top: 16, bottom: 16 },
        }}
        onMount={handleEditorDidMount}
        path="HelloWorld.tsx"
      />
    </div>
  )
}
