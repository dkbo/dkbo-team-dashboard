import * as React from "react"
import { cn } from "@/lib/utils"

/** 表層容器（規格 §6.10）。variant="pane" 是工具頁窗格（§6.13：padding 0、gap 0，內容區自己 `min-h-0 flex-1 overflow-auto`）；
 *  `data-alert="danger" | "warn"` 畫狀態 ring（§3.7 ring-alert-*）。 */
function Card({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  variant?: "default" | "pane"
}) {
  return (
    <div
      data-slot="card"
      data-size={size}
      data-variant={variant}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground shadow-soft [--card-spacing:--spacing(5)] has-data-[slot=card-footer]:pb-0 data-[size=sm]:gap-3 data-[size=sm]:[--card-spacing:--spacing(4)] data-[alert=danger]:ring-2 data-[alert=danger]:ring-status-danger data-[alert=warn]:ring-2 data-[alert=warn]:ring-status-warn",
        variant === "pane" && "min-h-0 gap-0 p-0",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-x-3 gap-y-1 px-(--card-spacing) has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto] [.border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "flex min-w-0 items-center gap-1.5 font-heading text-base font-bold [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-brand-violet",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("line-clamp-2 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("px-(--card-spacing)", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center border-t bg-muted/50 px-(--card-spacing) py-3",
        className
      )}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
