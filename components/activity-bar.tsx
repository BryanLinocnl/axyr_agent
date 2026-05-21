"use client"

import { useState } from "react"
import {
  Files,
  Search,
  GitBranch,
  Play,
  PackageIcon,
  Globe,
  FlaskConical,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type ActivityItem = {
  id: string
  icon: React.ElementType
  label: string
}

const ITEMS: ActivityItem[] = [
  { id: "explorer", icon: Files, label: "Explorer" },
  { id: "search", icon: Search, label: "Search" },
  { id: "source", icon: GitBranch, label: "Source Control" },
  { id: "debug", icon: Play, label: "Run and Debug" },
  { id: "extensions", icon: PackageIcon, label: "Extensions" },
  { id: "remote", icon: Globe, label: "Remote Explorer" },
  { id: "testing", icon: FlaskConical, label: "Testing" },
]

export function ActivityBar() {
  const [active, setActive] = useState("explorer")

  return (
    <div className="flex w-10 shrink-0 flex-col items-center border-r border-[#2d2d2d] bg-[#141414] py-2">
      {ITEMS.map(({ id, icon: Icon, label }) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <button
              onClick={() => setActive(id)}
              className={cn(
                "relative flex h-10 w-10 items-center justify-center transition-colors",
                active === id
                  ? "text-[#e0e0e0]"
                  : "text-[#666666] hover:text-[#aaaaaa]",
              )}
            >
              {active === id && (
                <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-[#e0e0e0]" />
              )}
              <Icon className="h-5 w-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
