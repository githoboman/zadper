import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type ReactNode } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn as ZadperCn } from "@/lib/utils";

const ZadperButtonVariants = cva(
  "agent-pay-button rounded-lg font-semibold shadow-sm transition-[background-color,border-color,box-shadow,color,transform] duration-300 ease-out",
  {
    variants: {
      variant: {
        primary:
          "agent-pay-button-primary-white",
        secondary:
          "secondary-action border border-border bg-card text-card-foreground hover:bg-secondary hover:text-secondary-foreground",
        ghost:
          "ghost-action bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground",
        icon:
          "icon-action size-9 rounded-lg border border-border bg-card text-card-foreground hover:bg-secondary",
        explorer:
          "explorer-link rounded-md bg-transparent px-0 text-primary shadow-none hover:text-primary/80 hover:underline",
        nav:
          "hero-nav-link-control rounded-lg bg-card text-card-foreground shadow-sm hover:bg-secondary"
      },
      size: {
        default: "h-9 px-3.5 py-2",
        hero: "hero-cta h-11 px-5 text-base",
        compact: "agent-pay-button-compact h-8 px-3 text-xs"
      }
    },
    defaultVariants: {
      variant: "secondary",
      size: "default"
    }
  }
);

type ZadperButtonProps = Omit<ComponentPropsWithoutRef<typeof Button>, "size" | "variant"> &
  VariantProps<typeof ZadperButtonVariants>;

export const ZadperButton = forwardRef<ElementRef<typeof Button>, ZadperButtonProps>(
  ({ className, size, variant, ...props }, ref) => (
    <Button
      className={ZadperCn(ZadperButtonVariants({ size, variant }), className)}
      ref={ref}
      variant={variant === "ghost" || variant === "explorer" || variant === "primary" ? "ghost" : "secondary"}
      {...props}
    />
  )
);
ZadperButton.displayName = "ZadperButton";

type ZadperBadgeProps = ComponentPropsWithoutRef<"span"> & { state?: "idle" | "running" | "payment_required" | "complete" | "error" };

export const ZadperBadge = forwardRef<HTMLSpanElement, ZadperBadgeProps>(
  ({ children, className, state = "idle", ...props }, ref) => {
    const chipClass = {
      idle: "aspect-chip--neutral",
      running: "aspect-chip--caution",
      payment_required: "aspect-chip--caution",
      complete: "aspect-chip--clear",
      error: "aspect-chip--danger",
    }[state ?? "idle"] ?? "aspect-chip--neutral";
    return (
      <span
        className={ZadperCn("agent-pay-badge aspect-chip", chipClass, className)}
        ref={ref}
        {...props}
      >
        {children}
      </span>
    );
  }
);
ZadperBadge.displayName = "ZadperBadge";

export const ZadperCard = forwardRef<ElementRef<typeof Card>, ComponentPropsWithoutRef<typeof Card>>(
  ({ className, ...props }, ref) => (
    <Card className={ZadperCn("agent-pay-card panel border-border bg-card text-card-foreground", className)} ref={ref} {...props} />
  )
);
ZadperCard.displayName = "ZadperCard";

export const ZadperCardHeader = forwardRef<ElementRef<typeof CardHeader>, ComponentPropsWithoutRef<typeof CardHeader>>(
  ({ className, ...props }, ref) => (
    <CardHeader className={ZadperCn("agent-pay-card-header panel-header", className)} ref={ref} {...props} />
  )
);
ZadperCardHeader.displayName = "ZadperCardHeader";

export const ZadperTextarea = forwardRef<ElementRef<typeof Textarea>, ComponentPropsWithoutRef<typeof Textarea>>(
  ({ className, ...props }, ref) => (
    <Textarea className={ZadperCn("agent-pay-textarea bg-background", className)} ref={ref} {...props} />
  )
);
ZadperTextarea.displayName = "ZadperTextarea";

const ZadperSurfaceVariants = cva("agent-pay-surface border-border bg-card text-card-foreground", {
  variants: {
    variant: {
      default: "",
      connection: "agent-connection-panel",
      connectionActive: "agent-connection-panel connected",
      payment: "agent-pay-payment-sheet",
      readiness: "payment-readiness",
      source: "source-row",
      proof: "proof-row",
      receipt: "decision-receipt",
      record: "evidence-record"
    },
    state: {
      default: "",
      ready: "ready",
      configuration_required: "configuration_required",
      facilitator_unavailable: "facilitator_unavailable",
      facilitator_unsupported: "facilitator_unsupported",
      rpc_unavailable: "rpc_unavailable",
      payment_required: "payment_required",
      error: "error",
      missing: "missing",
      fail: "fail",
      pass: "pass"
    }
  },
  defaultVariants: {
    variant: "default",
    state: "default"
  }
});

type ZadperSurfaceProps = ComponentPropsWithoutRef<"div"> &
  VariantProps<typeof ZadperSurfaceVariants> & {
    asChild?: boolean;
  };

export const ZadperSurface = forwardRef<HTMLDivElement, ZadperSurfaceProps>(
  ({ asChild = false, className, state, variant, ...props }, ref) => {
    const Component = asChild ? Slot : "div";

    return (
      <Component
        className={ZadperCn(ZadperSurfaceVariants({ state, variant }), className)}
        ref={ref}
        {...props}
      />
    );
  }
);
ZadperSurface.displayName = "ZadperSurface";

const ZadperAlertVariants = cva("", {
  variants: {
    variant: {
      error: "error-banner border-destructive/40 bg-destructive/10 text-destructive",
      notice: "notice-banner border-border bg-card text-card-foreground"
    }
  },
  defaultVariants: {
    variant: "notice"
  }
});

type ZadperAlertProps = Omit<ComponentPropsWithoutRef<typeof Alert>, "variant"> &
  VariantProps<typeof ZadperAlertVariants>;

export const ZadperAlert = forwardRef<ElementRef<typeof Alert>, ZadperAlertProps>(
  ({ className, variant, ...props }, ref) => (
    <Alert
      className={ZadperCn("agent-pay-alert", ZadperAlertVariants({ variant }), className)}
      ref={ref}
      variant={variant === "error" ? "destructive" : "default"}
      {...props}
    />
  )
);
ZadperAlert.displayName = "ZadperAlert";

export const ZadperField = forwardRef<ElementRef<typeof Label>, ComponentPropsWithoutRef<typeof Label>>(
  ({ className, ...props }, ref) => (
    <Label className={ZadperCn("agent-pay-field", className)} ref={ref} {...props} />
  )
);
ZadperField.displayName = "ZadperField";

export const ZadperFieldLabel = forwardRef<HTMLSpanElement, ComponentPropsWithoutRef<"span">>(
  ({ className, ...props }, ref) => (
    <span className={ZadperCn("agent-pay-field-label text-muted-foreground", className)} ref={ref} {...props} />
  )
);
ZadperFieldLabel.displayName = "ZadperFieldLabel";

export const ZadperCodeBlock = forwardRef<HTMLElement, ComponentPropsWithoutRef<"code">>(
  ({ className, ...props }, ref) => (
    <code className={ZadperCn("agent-pay-code-block tx-hash bg-muted text-foreground", className)} ref={ref} {...props} />
  )
);
ZadperCodeBlock.displayName = "ZadperCodeBlock";

export const ZadperInlineCode = forwardRef<HTMLElement, ComponentPropsWithoutRef<"code">>(
  ({ className, ...props }, ref) => (
    <code className={ZadperCn("agent-pay-inline-code bg-muted text-foreground", className)} ref={ref} {...props} />
  )
);
ZadperInlineCode.displayName = "ZadperInlineCode";

export const ZadperSeparator = forwardRef<ElementRef<typeof Separator>, ComponentPropsWithoutRef<typeof Separator>>(
  ({ className, ...props }, ref) => (
    <Separator className={ZadperCn("agent-pay-separator", className)} ref={ref} {...props} />
  )
);
ZadperSeparator.displayName = "ZadperSeparator";


export const ZadperTabs = Tabs;

export const ZadperTabsList = forwardRef<ElementRef<typeof TabsList>, ComponentPropsWithoutRef<typeof TabsList>>(
  ({ className, ...props }, ref) => (
    <TabsList className={ZadperCn("agent-pay-tabs-list", className)} ref={ref} {...props} />
  )
);
ZadperTabsList.displayName = "ZadperTabsList";

export const ZadperTabsTrigger = forwardRef<ElementRef<typeof TabsTrigger>, ComponentPropsWithoutRef<typeof TabsTrigger>>(
  ({ className, ...props }, ref) => (
    <TabsTrigger className={ZadperCn("agent-pay-tabs-trigger", className)} ref={ref} {...props} />
  )
);
ZadperTabsTrigger.displayName = "ZadperTabsTrigger";

export const ZadperTabsContent = forwardRef<ElementRef<typeof TabsContent>, ComponentPropsWithoutRef<typeof TabsContent>>(
  ({ className, ...props }, ref) => (
    <TabsContent className={ZadperCn("agent-pay-tabs-content", className)} ref={ref} {...props} />
  )
);
ZadperTabsContent.displayName = "ZadperTabsContent";

export const ZadperTable = forwardRef<ElementRef<typeof Table>, ComponentPropsWithoutRef<typeof Table>>(
  ({ className, ...props }, ref) => (
    <Table className={ZadperCn("agent-pay-table", className)} ref={ref} {...props} />
  )
);
ZadperTable.displayName = "ZadperTable";

export const ZadperTableHeader = TableHeader;
export const ZadperTableBody = TableBody;
export const ZadperTableRow = TableRow;
export const ZadperTableHead = TableHead;
export const ZadperTableCell = TableCell;

export const ZadperSheet = Sheet;

export const ZadperSheetContent = forwardRef<ElementRef<typeof SheetContent>, ComponentPropsWithoutRef<typeof SheetContent>>(
  ({ className, ...props }, ref) => (
    <SheetContent className={ZadperCn("agent-pay-sheet-content", className)} ref={ref} {...props} />
  )
);
ZadperSheetContent.displayName = "ZadperSheetContent";

export const ZadperSheetHeader = SheetHeader;
export const ZadperSheetTitle = SheetTitle;
export const ZadperSheetDescription = SheetDescription;

export const ZadperTooltipProvider = TooltipProvider;
export const ZadperTooltip = Tooltip;
export const ZadperTooltipTrigger = TooltipTrigger;

export const ZadperTooltipContent = forwardRef<ElementRef<typeof TooltipContent>, ComponentPropsWithoutRef<typeof TooltipContent>>(
  ({ className, ...props }, ref) => (
    <TooltipContent className={ZadperCn("agent-pay-tooltip-content", className)} ref={ref} {...props} />
  )
);
ZadperTooltipContent.displayName = "ZadperTooltipContent";

export function ZadperIconAction({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <ZadperTooltip>
      <ZadperTooltipTrigger asChild>
        <ZadperButton variant="icon" aria-label={label} onClick={onClick}>
          {children}
        </ZadperButton>
      </ZadperTooltipTrigger>
      <ZadperTooltipContent>{label}</ZadperTooltipContent>
    </ZadperTooltip>
  );
}
