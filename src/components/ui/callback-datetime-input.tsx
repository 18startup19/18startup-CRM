"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/card";
import { isoToLocalInput, localInputToIso } from "@/lib/utils";

interface Props {
  id?: string;
  name?: string;
  defaultValueIso?: string | null;
}

// Split-brain datetime picker: user edits a wall-clock string via a visible
// datetime-local input, but the form submits a proper UTC ISO via a hidden
// field. Without this, the naked "YYYY-MM-DDTHH:MM" string that a browser
// posts gets pinned to whatever tz Postgres feels like, shifting callbacks
// by hours and breaking the reminder popup.
export function CallbackDateTimeInput({
  id,
  name = "next_callback_at",
  defaultValueIso,
}: Props) {
  const [local, setLocal] = useState(() => isoToLocalInput(defaultValueIso));
  const hiddenRef = useRef<HTMLInputElement>(null);
  const skipFirst = useRef(true);

  // Keep the hidden field in sync AND fire a native input event so the
  // parent form's onChange autosave picks up the change.
  useEffect(() => {
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    if (!hiddenRef.current) return;
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(hiddenRef.current, localInputToIso(local));
    hiddenRef.current.dispatchEvent(new Event("input", { bubbles: true }));
  }, [local]);

  return (
    <>
      <Input
        id={id}
        type="datetime-local"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
      />
      <input
        ref={hiddenRef}
        type="hidden"
        name={name}
        defaultValue={localInputToIso(isoToLocalInput(defaultValueIso))}
      />
    </>
  );
}
