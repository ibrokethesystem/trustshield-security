import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<"input">, "type"> & {
  /** Initial visibility (defaults to hidden). */
  defaultVisible?: boolean;
};

/**
 * Password field with a built-in eye toggle to reveal / hide the value.
 * Behaves exactly like <Input type="password" />, plus a trailing icon button.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, defaultVisible = false, disabled, ...props }, ref) => {
    const [visible, setVisible] = React.useState(defaultVisible);
    return (
      <div className={cn("relative", className)}>
        <Input
          {...props}
          ref={ref}
          type={visible ? "text" : "password"}
          disabled={disabled}
          className="pr-10"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((v) => !v)}
          disabled={disabled}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:text-foreground disabled:opacity-50"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";