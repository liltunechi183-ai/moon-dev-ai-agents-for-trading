"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

/** Collapsible argue-with-the-analyst thread on the latest OK prediction. */
export function ChallengeChat({
  predictionId,
  onRevised,
}: {
  predictionId: number;
  onRevised: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [jobId, setJobId] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadThread = useCallback(async () => {
    const res = await fetch(`/api/chat/${predictionId}`);
    if (res.ok) setMessages(await res.json());
  }, [predictionId]);

  useEffect(() => {
    loadThread();
  }, [loadThread]);

  useEffect(() => {
    if (jobId === null) return;
    const startedAt = Date.now();
    pollRef.current = setInterval(async () => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      const res = await fetch(`/api/jobs/${jobId}`);
      if (!res.ok) return;
      const job = await res.json();
      if (job.status === "done" || job.status === "error") {
        clearInterval(pollRef.current!);
        setJobId(null);
        setElapsed(0);
        await loadThread();
        if (job.status === "done" && job.result?.revisedPredictionId) onRevised();
      }
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [jobId, loadThread, onRevised]);

  async function send() {
    const message = input.trim();
    if (!message || jobId !== null) return;
    setInput("");
    const res = await fetch(`/api/chat/${predictionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    if (res.ok) {
      const data = await res.json();
      await loadThread();
      setJobId(data.jobId);
    }
  }

  return (
    <details className="rounded-lg border border-[#38bdf8]/20 bg-[#38bdf8]/[0.03] p-3">
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[#38bdf8]">
        Challenge this prediction {messages.length > 0 ? `(${messages.length})` : ""}
      </summary>
      <div className="mt-3 flex flex-col gap-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              m.role === "user"
                ? "self-end bg-white/10 text-zinc-100"
                : "self-start bg-[#38bdf8]/10 text-zinc-200"
            }`}
          >
            {m.content}
          </div>
        ))}
        {jobId !== null && (
          <p className="text-xs text-zinc-500">Analyst is re-researching… {elapsed}s</p>
        )}
        <div className="mt-1 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Argue with the analyst — cite your numbers"
            disabled={jobId !== null}
            className="flex-1 rounded-md border border-white/10 bg-white/[0.02] px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={jobId !== null || input.trim().length === 0}
            className="rounded-md bg-[#38bdf8]/15 px-3 py-1.5 text-xs font-medium text-[#38bdf8] disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </details>
  );
}
