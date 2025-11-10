import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Server } from "lucide-react";

interface SystemInstanceSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

export function SystemInstanceSelector({ value, onValueChange, disabled }: SystemInstanceSelectorProps) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger 
        className="w-[280px]" 
        data-testid="select-system-instance"
      >
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <SelectValue placeholder="Select environment" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem 
          value="default-dev" 
          data-testid="option-default-dev"
        >
          <div className="flex flex-col">
            <span className="font-medium">DEV Instance</span>
            <span className="text-xs text-muted-foreground">default-dev</span>
          </div>
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
