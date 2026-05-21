"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism"
import { Check, Copy } from "lucide-react"

function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="my-3 overflow-hidden rounded-md bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-3 py-1.5">
        <span className="text-[10px] text-[#666666] font-mono">
          {language || "code"}
        </span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[#666666] hover:bg-[#2d2d2d] hover:text-[#cccccc] transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        language={language || "text"}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: "12px",
          fontSize: "11px",
          lineHeight: "1.6",
          background: "#1e1e1e",
          borderRadius: 0,
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono), 'JetBrains Mono', monospace" } }}
        wrapLongLines={false}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }) {
          const isInline = !className
          const language = className?.replace("language-", "") ?? ""
          const code = String(children).replace(/\n$/, "")

          if (isInline) {
            return (
              <code
                className="rounded bg-[#2d2d2d] px-1 py-0.5 font-mono text-[11px] text-[#e06c75]"
                {...props}
              >
                {children}
              </code>
            )
          }

          return <CodeBlock language={language} code={code} />
        },
        p({ children }) {
          return (
            <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
          )
        },
        strong({ children }) {
          return (
            <strong className="font-semibold text-[#e0e0e0]">{children}</strong>
          )
        },
        em({ children }) {
          return <em className="italic text-[#aaaaaa]">{children}</em>
        },
        h1({ children }) {
          return (
            <h1 className="mb-2 mt-3 text-sm font-bold text-[#e0e0e0]">
              {children}
            </h1>
          )
        },
        h2({ children }) {
          return (
            <h2 className="mb-2 mt-3 text-xs font-semibold text-[#e0e0e0]">
              {children}
            </h2>
          )
        },
        h3({ children }) {
          return (
            <h3 className="mb-1 mt-2 text-xs font-semibold text-[#cccccc]">
              {children}
            </h3>
          )
        },
        ul({ children }) {
          return (
            <ul className="mb-2 ml-4 list-disc space-y-0.5">{children}</ul>
          )
        },
        ol({ children }) {
          return (
            <ol className="mb-2 ml-4 list-decimal space-y-0.5">{children}</ol>
          )
        },
        li({ children }) {
          return <li className="leading-relaxed">{children}</li>
        },
        blockquote({ children }) {
          return (
            <blockquote className="my-2 border-l-2 border-[#3d3d3d] pl-3 text-[#888888] italic">
              {children}
            </blockquote>
          )
        },
        hr() {
          return <hr className="my-3 border-[#2d2d2d]" />
        },
        a({ href, children }) {
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-[#007acc] underline hover:text-[#5ab4f3]"
            >
              {children}
            </a>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
