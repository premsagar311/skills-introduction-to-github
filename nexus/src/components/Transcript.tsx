import { useEffect, useRef } from "react";
import { Message } from "../types";

export default function Transcript({ messages }: { messages: Message[] }) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="transcript empty">
        <p>Say &ldquo;what time is it&rdquo;, &ldquo;take a note buy milk&rdquo; or ask anything at all.</p>
      </div>
    );
  }

  return (
    <div className="transcript">
      {messages.map((message) => (
        <div key={message.id} className={`bubble ${message.role}`}>
          <p>{message.text}</p>
          <span className="meta">
            {new Date(message.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            {message.source === "skill" ? " · skill" : message.source === "llm" ? " · ai" : ""}
          </span>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
