import { CircleAlert } from "lucide-react";

interface ServerErrorProps {
  message?: string | null;
}

export function ServerError({ message }: ServerErrorProps) {
  if (!message) return null;

  return (
    <p className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm">
      <CircleAlert className="size-4 shrink-0" />
      {message}
    </p>
  );
}
