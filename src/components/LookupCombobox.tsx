import * as React from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface LookupItem {
  id: string;
  name: string;
  /** Extra keywords for search (won't show in display) */
  searchKeywords?: string;
}

export interface LookupComboboxProps {
  items: LookupItem[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  disabled?: boolean;
}

export function LookupCombobox({
  items,
  value,
  onValueChange,
  placeholder = "اختر...",
  searchPlaceholder = "ابحث...",
  emptyMessage = "لا توجد نتائج.",
  className,
  disabled = false,
}: LookupComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = items.find((i) => i.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "w-full justify-between h-9 font-normal text-sm shadow-xs transition-colors",
            "hover:bg-accent/50",
            !value && "text-muted-foreground",
            open && "ring-2 ring-ring/20 border-ring",
            className
          )}
        >
          <span className="truncate flex-1 text-right">
            {selected ? selected.name : placeholder}
          </span>
          <ChevronsUpDown className="mr-2 h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0 shadow-lg border-border/80"
        align="start"
        sideOffset={5}
      >
        <Command dir="rtl" className="rounded-md">
          <CommandInput placeholder={searchPlaceholder} className="h-10 text-sm" />
          <CommandList>
            <CommandEmpty>
              <div className="flex flex-col items-center gap-1.5">
                <Search className="h-5 w-5 text-muted-foreground/40" />
                <span>{emptyMessage}</span>
              </div>
            </CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={
                    item.searchKeywords
                      ? `${item.name} ${item.searchKeywords}`
                      : item.name
                  }
                  onSelect={() => {
                    onValueChange(item.id === value ? "" : item.id);
                    setOpen(false);
                  }}
                >
                  <span className="flex-1 truncate">{item.name}</span>
                  <Check
                    className={cn(
                      "mr-auto h-4 w-4 shrink-0 text-primary transition-opacity",
                      value === item.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
