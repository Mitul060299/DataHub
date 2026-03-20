interface ErrorBubbleProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorBubble = ({ message, onRetry, retryLabel = "Try again" }: ErrorBubbleProps) => (
  <div className="error-bubble" role="alert" aria-live="polite">
    <span className="error-bubble__icon" aria-hidden="true">⚠️</span>
    <span className="error-bubble__message">{message}</span>
    {onRetry && (
      <button className="error-bubble__retry" onClick={onRetry}>
        {retryLabel}
      </button>
    )}
  </div>
);
