type NotifyKind = "success" | "error" | "info";

const emit = (kind: NotifyKind, text: string) => {
  window.dispatchEvent(
    new CustomEvent("datahub:notify", {
      detail: { kind, text },
    }),
  );
};

export const notify = {
  success: (text: string) => emit("success", text),
  error: (text: string) => emit("error", text),
  info: (text: string) => emit("info", text),
};
