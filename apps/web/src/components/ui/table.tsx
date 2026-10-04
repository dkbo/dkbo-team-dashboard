"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const DENSITY_CLASS = {
  // 規格 §6.19：表頭列 bar（h-10）、列 row（h-11）；dense 兩者都 row-dense（h-9）
  default: "[&_thead_tr]:h-10 [&_tbody_tr]:h-11",
  dense: "[&_thead_tr]:h-9 [&_tbody_tr]:h-9",
} as const

/** density：default｜dense（§6.19）。flush：表格滿卡寬時首欄左、末欄右留 inset-control-lg（px-5） */
function Table({
  className,
  density = "default",
  flush = false,
  ...props
}: React.ComponentProps<"table"> & {
  density?: "default" | "dense"
  flush?: boolean
}) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto"
    >
      <table
        data-slot="table"
        data-density={density}
        className={cn(
          "w-full caption-bottom text-sm",
          DENSITY_CLASS[density],
          flush && "[&_tr>*:first-child]:pl-5 [&_tr>*:last-child]:pr-5",
          className
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b dark:[&_tr]:border-b-2", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors duration-150 hover:bg-muted/60 has-aria-expanded:bg-muted/60 data-[state=selected]:bg-accent/60",
        className
      )}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "px-3 text-left align-middle text-xs font-bold whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
