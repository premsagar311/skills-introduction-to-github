interface OrbProps {
  status: "idle" | "listening" | "thinking" | "speaking";
  onClick: () => void;
}

export default function Orb({ status, onClick }: OrbProps) {
  return (
    <button
      type="button"
      className={`orb orb-${status}`}
      onClick={onClick}
      aria-label={status === "listening" ? "Stop listening" : "Start listening"}
    >
      <span className="orb-core" />
      <span className="orb-ring" />
      <span className="orb-ring orb-ring-late" />
      <svg className="orb-mic" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
        <path d="M19 12a7 7 0 0 1-14 0M12 19v3" />
      </svg>
    </button>
  );
}
