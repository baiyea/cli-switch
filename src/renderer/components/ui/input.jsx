import * as React from "react";
import { cn } from "../../lib/utils";

const Input = React.forwardRef(({ className, type = "text", ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-[#2a3345] bg-[#0e1520] px-3 py-2 text-sm text-[#e7ecf3] placeholder:text-[#7d889b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5f7399] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Input.displayName = "Input";

export { Input };
