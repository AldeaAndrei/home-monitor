import { twMerge } from "tailwind-merge";

export default function BasePanel({ children, className, ...props }) {
  return (
    <div className={twMerge("bg-secondary-background p-1 rounded-xl", className)} {...props}>
      {children}
    </div>
  );
}
